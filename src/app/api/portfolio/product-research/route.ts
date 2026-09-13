import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { readPortfolioProductResearch, refreshPortfolioProductResearch } from '@/lib/services/portfolio-product-research.service'
import { DEFAULT_DATASETS } from '@/lib/data-subscriptions'
import { notifySubscriptionWorker } from '@/lib/subscription-dispatch'
import { sameOriginRequest } from '@/lib/security/request-origin'
import { ensurePortfolioFundSubscriptions } from '@/lib/portfolio-fund-subscriptions'

export const runtime = 'nodejs'
export const maxDuration = 300
async function account() {
  return prisma.portfolio.findFirst({ orderBy: [{ isDefault: 'desc' }, { createdAt: 'asc' }], include: { holdings: true } })
}
export async function GET() {
  const portfolio = await account()
  if (!portfolio) return NextResponse.json({ error: '尚无账户持仓' }, { status: 404 })
  const research = await readPortfolioProductResearch(portfolio.holdings, new Date().toISOString(), prisma, portfolio.id)
  // This endpoint exposes private research selection; it never modifies an archived report.
  return NextResponse.json({ research }, { headers: { 'Cache-Control': 'private, no-store' } })
}
export async function POST(request: NextRequest) {
  if (!sameOriginRequest(request)) return NextResponse.json({ error: '禁止跨站刷新私有基金研究' }, { status: 403 })
  const portfolio = await account()
  if (!portfolio) return NextResponse.json({ error: '尚无账户持仓' }, { status: 404 })
  let body: { codes?: unknown }
  try { body = await request.json() } catch { return NextResponse.json({ error: '请求必须为JSON' }, { status: 400 }) }
  const research = await readPortfolioProductResearch(portfolio.holdings, new Date().toISOString(), prisma, portfolio.id)
  const allowed = [...new Set([...portfolio.holdings.map(item => item.ticker), ...research.requiredEtfCodes])]
  const codes = body.codes ?? portfolio.holdings.map(item => item.ticker)
  if (!Array.isArray(codes) || !codes.length || codes.length > 30 || codes.some(code => typeof code !== 'string' || !allowed.includes(code))) return NextResponse.json({ error: '仅可刷新当前账户基金及已核验底层ETF' }, { status: 400 })
  const underlying = [...new Set([...research.requiredEtfCodes, ...research.products.filter(item => item.productType === 'etf' && codes.includes(item.ticker)).map(item => item.ticker)])].filter(code => codes.includes(code) || research.requests.some(item => item.targetCode === code && item.requiredBy.some(ticker => codes.includes(ticker) || codes.includes(code))))
  // Add missing datasets without deleting existing subscriptions, history or user configuration.
  const queued = await prisma.$transaction(async tx => {
    const scheduled: string[] = []
    for (const code of underlying) {
      const instrument = await tx.instrument.upsert({ where: { type_code: { type: 'ETF', code } }, create: { type: 'ETF', code, name: research.products.find(item => item.ticker === code)?.name || code, market: 'CN' }, update: {} })
      const subscription = await tx.dataSubscription.upsert({ where: { instrumentId: instrument.id }, create: { instrumentId: instrument.id, enabled: true, profile: JSON.stringify({ source: 'portfolio-product-research' }) }, update: {} })
      if (!subscription.enabled) continue
      for (const definition of DEFAULT_DATASETS.filter(item => ['etf_realtime','etf_daily','etf_holdings','etf_research'].includes(item.datasetKey))) {
        const dataset = await tx.subscriptionDataset.upsert({ where: { subscriptionId_datasetKey: { subscriptionId: subscription.id, datasetKey: definition.datasetKey } }, create: { subscriptionId: subscription.id, ...definition, enabled: true }, update: {} })
        if (!dataset.enabled || ['queued','running'].includes(dataset.status)) continue
        const claimed = await tx.subscriptionDataset.updateMany({ where: { id: dataset.id, status: { notIn: ['queued','running'] } }, data: { status: 'queued', nextRunAt: new Date(), lastError: null } })
        if (claimed.count) { await tx.dataFetchRun.create({ data: { datasetId: dataset.id, targetCode: code, status: 'queued', qualityStatus: 'pending' } }); scheduled.push(`${code}/${definition.datasetKey}`) }
      }
    }
    return scheduled
  })
  let collectionWarning: string | null = null
  if (queued.length) { try { await notifySubscriptionWorker() } catch { collectionWarning = '底层ETF任务已保存，数据服务暂未接受唤醒；请查看数据订阅状态' } }
  // Exchange ETFs use their existing subscription collector and SH/SZ identities.
  // Never send an exchange ETF through the OTC .OF NAV collector.
  const exchangeCodes = new Set([...research.requiredEtfCodes, ...research.products.filter(item => item.productType === 'etf').map(item => item.ticker)])
  const fundCodes = codes.filter(code => !exchangeCodes.has(code))
  await ensurePortfolioFundSubscriptions(portfolio.holdings.filter(item => fundCodes.includes(item.ticker)))
  const result = await refreshPortfolioProductResearch(fundCodes)
  for (const ticker of codes.filter(code => exchangeCodes.has(code))) result.results.push({ ticker, status: 'partial', evidenceIds: [], gaps: ['场内指数基金资料由数据订阅采集，请在数据订阅页面核对任务状态'] })
  result.completed = result.results.length
  result.total = codes.length
  return NextResponse.json({ ...result, queuedUnderlyingDatasets: queued, collectionWarning, message: '已追加公开基金证据，底层ETF采集由订阅服务执行。待采集完成后新建分析；归档报告保持原有快照。' }, { headers: { 'Cache-Control': 'private, no-store' } })
}
