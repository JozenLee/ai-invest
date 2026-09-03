import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { getSubscriptionOverview, syncGraphEtfSubscriptions } from '@/lib/data-subscription-overview'

const REFRESH_DATASETS = ['etf_realtime', 'etf_daily', 'etf_holdings', 'constituent_stock_realtime', 'constituent_stock_daily', 'stock_financial', 'stock_announcement']

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({})) as { scope?: string }
    if (body.scope === 'market_index') {
      const serviceUrl = process.env.DATA_SERVICE_URL || 'http://localhost:8000'
      const response = await fetch(`${serviceUrl}/api/market/overview?refresh=true`, { cache: 'no-store', signal: AbortSignal.timeout(30000) })
      if (!response.ok) throw new Error('市场指数同步失败')
      return NextResponse.json({ success: true, data: { syncedEtfCount: 0, queuedDatasets: 0, overview: await getSubscriptionOverview(false) } }, { status: 202 })
    }
    await syncGraphEtfSubscriptions()
    const subscriptions = await prisma.dataSubscription.findMany({ include: { instrument: true, datasets: true }, where: { enabled: true, instrument: { type: 'ETF' } } })
    const subscriptionByDataset = new Map(subscriptions.flatMap((subscription) => subscription.datasets.map((dataset) => [dataset.id, subscription.instrument.code] as const)))
    const scope = body.scope
    const scopeKeys = scope === 'etf_index' ? ['etf_realtime', 'etf_daily', 'etf_holdings'] : scope === 'company_quote' ? ['constituent_stock_realtime', 'constituent_stock_daily', 'stock_financial', 'stock_announcement'] : scope === 'market_index' ? [] : REFRESH_DATASETS
    const datasets = subscriptions.flatMap((subscription) => subscription.datasets.filter((dataset) => dataset.enabled && scopeKeys.includes(dataset.datasetKey)))
    const queueableDatasets = datasets.filter((dataset) => !['queued', 'running'].includes(dataset.status))
    const activeDatasetIds = datasets.filter((dataset) => ['queued', 'running'].includes(dataset.status)).map((dataset) => dataset.id)
    const activeRuns = activeDatasetIds.length ? await prisma.dataFetchRun.findMany({ where: { datasetId: { in: activeDatasetIds }, status: { in: ['queued', 'running'] } }, select: { id: true } }) : []
    const now = new Date()
    const runs = await prisma.$transaction([
      ...queueableDatasets.map((dataset) => prisma.dataFetchRun.create({ data: { datasetId: dataset.id, targetCode: subscriptionByDataset.get(dataset.id) || '', status: 'queued', qualityStatus: 'pending' } })),
      prisma.subscriptionDataset.updateMany({ where: { id: { in: queueableDatasets.map((dataset) => dataset.id) } }, data: { status: 'queued', nextRunAt: now, lastError: null } }),
    ])
    const serviceUrl = process.env.DATA_SERVICE_URL || 'http://localhost:8000'
    void fetch(`${serviceUrl}/api/data/local/subscriptions/refresh-due`, { method: 'POST', signal: AbortSignal.timeout(3000) }).catch(() => undefined)
    const runIds = [...activeRuns.map((run) => run.id), ...runs.filter((run): run is typeof run & { id: string } => 'id' in run).map((run) => run.id)]
    return NextResponse.json({ success: true, data: { syncedEtfCount: subscriptions.length, queuedDatasets: queueableDatasets.length, runIds, overview: await getSubscriptionOverview(false) } }, { status: 202 })
  } catch (error) {
    return NextResponse.json({ success: false, error: error instanceof Error ? error.message : '刷新订阅数据失败' }, { status: 500 })
  }
}
