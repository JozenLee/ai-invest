/** Private orchestration. Freeze is read-only; refresh must be explicitly invoked.
 * Only public fund codes leave this process. No account, shares, balances or lots
 * are included in collection requests, and no endpoint performs a transaction.
 */
import { createHash } from 'node:crypto'
import { prisma } from '@/lib/db'
import { buildPortfolioResearchUniverse, VERIFIED_PRODUCT_IDENTITIES, type ActualProductHolding, type ProductRawPayload } from '@/lib/portfolio/product-research'

export const PORTFOLIO_PRODUCT_DATASETS = ['fund_identity','fund_profile','fund_research','fund_nav','fund_holdings','fund_asset_allocation','fund_execution','etf_research','etf_holdings'] as const

/** Called inside the caller's existing frozen/private DB transaction when provided. */
export async function readPortfolioProductResearch(holdings: readonly ActualProductHolding[], asOf: string, db: Pick<typeof prisma, 'rawPayload'> = prisma, portfolioId?: string) {
  if (!Number.isFinite(Date.parse(asOf))) throw new Error('Invalid portfolio research asOf')
  const codes = [...new Set(holdings.map(h=>h.ticker).filter(t=>/^\d{6}$/.test(t)))]
  const datasets=PORTFOLIO_PRODUCT_DATASETS.filter(key=>key!=='fund_execution'||!!portfolioId)
  const loaded = await db.rawPayload.findMany({where:{targetCode:{in:codes.flatMap(c=>[c,c+'.OF',c+'.SH',c+'.SZ'])},datasetKey:{in:datasets},fetchedAt:{lte:new Date(asOf)}},orderBy:{fetchedAt:'desc'}})
  const actual=loaded.filter(row=>{
    if(row.datasetKey!=='fund_execution')return true
    if(!portfolioId)return false
    try{return JSON.parse(row.payload)?.portfolioId===portfolioId}catch{return false}
  })
  const preliminary = buildPortfolioResearchUniverse({holdings,asOf,rawPayloads:actual,portfolioId})
  const targets = preliminary.requiredEtfCodes.filter(c=>!codes.includes(c))
  const underlying = targets.length ? await db.rawPayload.findMany({where:{targetCode:{in:targets.flatMap(c=>[c,c+'.SH',c+'.SZ'])},datasetKey:{in:['etf_holdings','etf_research']},fetchedAt:{lte:new Date(asOf)}},orderBy:{fetchedAt:'desc'}}) : []
  return buildPortfolioResearchUniverse({holdings,asOf,rawPayloads:[...actual,...underlying],portfolioId})
}

/** Explicit refresh: persists new public-source evidence without changing Holding or mappings.
 * Returns partial failures per code. The caller must refresh BEFORE opening a freeze transaction.
 */
export type PortfolioRefreshResult = {ticker:string;status:'refreshed'|'partial'|'failed';evidenceIds:string[];gaps:string[]}
export async function refreshPortfolioProductResearch(codes: readonly string[], options: {
  dataServiceUrl?: string; fetcher?: typeof fetch; db?: Pick<typeof prisma,'rawPayload'>
  onProgress?: (progress: {completed:number;total:number;result:PortfolioRefreshResult}) => void
  /** May lower deadlines for callers/tests, never raise the 45s/290s bounds. */
  timeoutMs?: number; totalTimeoutMs?: number
} = {}) {
  const tickers = [...new Set(codes)]
  if (tickers.length > 30 || tickers.some(c=>!/^\d{6}$/.test(c))) throw new Error('Expected up to 30 public fund codes')
  const db=options.db || prisma, fetcher=options.fetcher || fetch
  const base=options.dataServiceUrl || process.env.DATA_SERVICE_URL || 'http://localhost:8000'
  const results: PortfolioRefreshResult[] = new Array(tickers.length)
  const deadline = Date.now() + Math.min(290000, Math.max(1, options.totalTimeoutMs ?? 290000))
  const perCode = Math.min(45000, Math.max(1, options.timeoutMs ?? 45000))
  const collect = async (ticker: string, signal: AbortSignal): Promise<PortfolioRefreshResult> => {
    const ids: string[] = [], gaps: string[] = []
    try {
      const response=await fetcher(`${base.replace(/\/$/,'')}/api/portfolio-products/${ticker}/research`,{signal,cache:'no-store'})
      if (!response.ok) throw new Error(`Data service HTTP ${response.status}`)
      const body=await response.json()
      signal.throwIfAborted()
      if (body?.data?.ticker !== ticker || !body?.success) throw new Error('No usable product evidence or mismatched fund code')
      const payload=JSON.stringify(body)
      const record=await db.rawPayload.create({data:{datasetKey:'fund_research',targetCode:ticker,provider:'public-fund-research',payload,contentHash:createHash('sha256').update(payload).digest('hex')}})
      ids.push(record.id)
      signal.throwIfAborted()
      // Persist the reviewed identity registry without claiming it was newly re-verified.
      const identity=VERIFIED_PRODUCT_IDENTITIES.find(i=>i.ticker===ticker)
      if (identity) {
        const identityPayload=JSON.stringify({identity})
        const stored=await db.rawPayload.create({data:{datasetKey:'fund_identity',targetCode:ticker,provider:'reviewed-official-identity-registry',payload:identityPayload,contentHash:createHash('sha256').update(identityPayload).digest('hex')}})
        ids.push(stored.id)
      } else gaps.push('产品正式身份尚需发行人或交易所资料核验')
      for (const field of Object.keys(body.failures || {})) gaps.push(`${({series:'基金净值与资产配置',nav:'基金净值',holdings:'披露持仓',assetAllocation:'资产配置',adjustedNav:'复权净值',adjustedNavLag:'复权净值发布进度',targetFundHoldings:'联接基金的实际投资比例',navConflict:'同日净值一致性'} as Record<string,string>)[field] || '公开基金资料'}：采集未完成或未通过校验，请刷新后复核`)
      if (Array.isArray(body.gaps)) gaps.push(...body.gaps.filter((g:unknown):g is string=>typeof g==='string'))
      return {ticker,status:gaps.length?'partial':'refreshed',evidenceIds:ids,gaps}
    } catch (error) {
      return {ticker,status:ids.length?'partial':'failed',evidenceIds:ids,gaps:[error instanceof Error && /^Data service HTTP \d+$/.test(error.message) ? `数据服务暂不可用（状态码 ${error.message.match(/\d+$/)?.[0]}）` : '公开基金采集失败或数据无效；已保留既有证据']}
    }
  }
  let next=0,completed=0
  await Promise.all(Array.from({length:Math.min(3,tickers.length)},async()=>{
    for (;;) {
      const index=next++
      if (index>=tickers.length) return
      const ticker=tickers[index],remaining=deadline-Date.now()
      if (remaining<=0) results[index]={ticker,status:'failed',evidenceIds:[],gaps:['本轮刷新总时限已到；未开始该基金采集，可单独重试']}
      else {
        const controller=new AbortController()
        let timer: ReturnType<typeof setTimeout> | undefined
        // Race also bounds a stalled body read or a custom fetch implementation.
        const timeout=new Promise<PortfolioRefreshResult>(resolve=>{
          timer=setTimeout(()=>{
            resolve({ticker,status:'failed',evidenceIds:[],gaps:['单基金或本轮刷新已超时；成功写入的证据保留，可单独重试']})
            controller.abort()
          },Math.min(perCode,remaining))
        })
        results[index]=await Promise.race([collect(ticker,controller.signal),timeout])
        if (timer) clearTimeout(timer)
      }
      completed++
      try { options.onProgress?.({completed,total:tickers.length,result:results[index]}) } catch { /* Observer cannot roll back collected evidence. */ }
    }
  }))
  return {scope:'private-portfolio' as const,results,completed,total:tickers.length}
}

// Structural compatibility for callers that already loaded rows in their transaction.
export type PortfolioProductRawRecord = ProductRawPayload

