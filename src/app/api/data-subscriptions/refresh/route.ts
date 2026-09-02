import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { syncGraphEtfSubscriptions, getSubscriptionOverview } from '@/lib/data-subscription-overview'

const REFRESH_DATASETS = ['etf_realtime', 'etf_holdings', 'constituent_stock_realtime']

export async function POST() {
  try {
    const graph = await syncGraphEtfSubscriptions()
    const subscriptions = await prisma.dataSubscription.findMany({ include: { instrument: true, datasets: true }, where: { enabled: true, instrument: { type: 'ETF' } } })
    const subscriptionByDataset = new Map(subscriptions.flatMap((subscription) => subscription.datasets.map((dataset) => [dataset.id, subscription.instrument.code] as const)))
    const datasets = subscriptions.flatMap((subscription) => subscription.datasets.filter((dataset) => dataset.enabled && REFRESH_DATASETS.includes(dataset.datasetKey)))
    const now = new Date()
    await prisma.$transaction([
      ...datasets.map((dataset) => prisma.dataFetchRun.create({ data: { datasetId: dataset.id, targetCode: subscriptionByDataset.get(dataset.id) || '', status: 'queued', qualityStatus: 'pending' } })),
      prisma.subscriptionDataset.updateMany({ where: { id: { in: datasets.map((dataset) => dataset.id) } }, data: { status: 'queued', nextRunAt: now, lastError: null } }),
    ])
    return NextResponse.json({ success: true, data: { syncedEtfCount: graph.etfCount, queuedDatasets: datasets.length, overview: await getSubscriptionOverview(false) } }, { status: 202 })
  } catch (error) {
    return NextResponse.json({ success: false, error: error instanceof Error ? error.message : '刷新订阅数据失败' }, { status: 500 })
  }
}
