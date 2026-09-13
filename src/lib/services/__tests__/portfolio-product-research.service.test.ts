import { describe, it, expect, vi } from 'vitest'
vi.mock('@/lib/db/prisma',()=>({default:{rawPayload:{}}}))
import { readPortfolioProductResearch, refreshPortfolioProductResearch } from '../portfolio-product-research.service'

describe('private product refresh and freeze separation',()=>{
  it('only consumes explicitly selected account execution evidence; public NAV stays shared',async()=>{
    const asOf='2026-09-11T01:00:00Z'
    const evidence={id:'receipt',source:'channel',url:null,locator:'fee receipt',observedAt:'2026-09-10T16:00:00Z',publishedAt:null,dataDate:null}
    const make=(id:string,owner:string|undefined,rate:number)=>({id,targetCode:'026633',datasetKey:'fund_execution',provider:'user-provided',contentHash:id,fetchedAt:'2026-09-10T17:00:00Z',payload:JSON.stringify({portfolioId:owner,data:{buy:{ticker:'026633',productType:'active',side:'buy',asOf,otc:{channel:id,subscriptionFee:{value:{ratePct:rate,fixedAmount:0},evidence,validUntil:'2026-09-12T00:00:00Z'}}}}})})
    const nav={id:'nav',targetCode:'026633',datasetKey:'fund_nav',provider:'public',contentHash:'nav',fetchedAt:'2026-09-10T17:00:00Z',payload:JSON.stringify([{nav_date:'20260910',unit_nav:1.5,adj_nav:1.6}])}
    const findMany=vi.fn().mockResolvedValue([make('other','account-b',9),make('legacy',undefined,8),make('own','account-a',0.1),{...make('bad','account-a',7),payload:'invalid'},nav])
    const db={rawPayload:{findMany}} as never
    const holdings=[{ticker:'026633',name:'平安主动混合',portfolioId:'account-b'}]
    const own=await readPortfolioProductResearch(holdings,asOf,db,'account-a')
    expect(own.products[0].executionMaterials.buy?.otc?.subscriptionFee?.value.ratePct).toBe(0.1)
    expect(own.products[0].executionMaterials.buy?.otc?.channel).toBe('own')
    const none=await readPortfolioProductResearch(holdings,asOf,db)
    expect(none.products[0].executionMaterials).toEqual({})
    expect(findMany.mock.calls.at(-1)?.[0].where.datasetKey.in).not.toContain('fund_execution')
    expect(none.products[0].navSeries[0].nav).toBe(1.5)
    const missing=await readPortfolioProductResearch(holdings,asOf,db,'account-c')
    expect(missing.products[0].executionMaterials).toEqual({})
    expect(missing.products[0].classification).toBe('official')
  })
  it('refreshes at concurrency three with per-code progress and stable result order',async()=>{
    let active=0,peak=0
    const create=vi.fn().mockResolvedValue({id:'raw'})
    const fetcher=vi.fn(async(url:string)=>{
      active++;peak=Math.max(peak,active)
      await new Promise(resolve=>setTimeout(resolve,5))
      active--
      const ticker=url.match(/products\/(\d+)\//)![1]
      if(ticker==='100003') return {ok:false,status:503}
      return {ok:true,json:async()=>({success:true,data:{ticker,nav:[{nav_date:'20260910',unit_nav:1}]},gaps:[]})}
    })
    const progress=vi.fn(),codes=['100001','100002','100003','100004','100005','100006','100007']
    const r=await refreshPortfolioProductResearch(codes,{fetcher:fetcher as never,db:{rawPayload:{create}} as never,onProgress:progress})
    expect(peak).toBe(3)
    expect(r.results.map(x=>x.ticker)).toEqual(codes)
    expect(r.results[2].status).toBe('failed')
    expect(progress).toHaveBeenCalledTimes(7)
    expect(r.completed).toBe(7)
  })
  it('bounds stalled bodies and the total batch without losing completed results',async()=>{
    const create=vi.fn().mockResolvedValue({id:'raw'})
    const fetcher=vi.fn(async(url:string)=>({ok:true,json:()=>url.includes('100001')?Promise.resolve({success:true,data:{ticker:'100001'},gaps:[]}):new Promise(()=>{})}))
    const r=await refreshPortfolioProductResearch(['100001','100002','100003','100004','100005'],{fetcher:fetcher as never,db:{rawPayload:{create}} as never,timeoutMs:15,totalTimeoutMs:25})
    expect(r.results[0].evidenceIds).toContain('raw')
    expect(r.results.slice(1).every(x=>x.status==='failed')).toBe(true)
    expect(r.results).toHaveLength(5)
  })
  it('sends public codes only, stores traceable responses and preserves partial gaps',async()=>{
    const create=vi.fn().mockResolvedValue({id:'raw1'}),fetcher=vi.fn().mockResolvedValue({ok:true,json:async()=>({success:true,data:{ticker:'017470',nav:[{nav_date:'20260910',unit_nav:1.4}]},failures:{holdings:'missing'},gaps:[]})})
    const r=await refreshPortfolioProductResearch(['017470'],{fetcher:fetcher as never,db:{rawPayload:{create}} as never})
    expect(fetcher.mock.calls[0][0]).toBe('http://localhost:8000/api/portfolio-products/017470/research')
    expect(fetcher.mock.calls[0][1]).not.toHaveProperty('body')
    expect(create.mock.calls[0][0].data.datasetKey).toBe('fund_research')
    expect(create.mock.calls[1][0].data.datasetKey).toBe('fund_identity')
    expect(r.results[0].status).toBe('partial')
  })
  it('does not persist wrong-share or failed source data',async()=>{
    const create=vi.fn(),fetcher=vi.fn().mockResolvedValue({ok:true,json:async()=>({success:true,data:{ticker:'026632'}})})
    const r=await refreshPortfolioProductResearch(['026633'],{fetcher:fetcher as never,db:{rawPayload:{create}} as never})
    expect(r.results[0].status).toBe('failed')
    expect(create).not.toHaveBeenCalled()
    await expect(refreshPortfolioProductResearch(['../secret'])).rejects.toThrow()
  })
  it('freeze only reads point-in-time rows, then reads reverse-discovered underlying ETF data',async()=>{
    const findMany=vi.fn().mockResolvedValue([]),create=vi.fn()
    const r=await readPortfolioProductResearch([{ticker:'024975',name:'华泰柏瑞联接'}],'2026-09-11T01:00:00Z',{rawPayload:{findMany,create}} as never)
    expect(r.requiredEtfCodes).toEqual(['588710'])
    expect(findMany.mock.calls[1][0].where.targetCode.in).toContain('588710')
    expect(findMany.mock.calls[0][0].where.fetchedAt.lte.toISOString()).toBe('2026-09-11T01:00:00.000Z')
    expect(create).not.toHaveBeenCalled()
  })
})
