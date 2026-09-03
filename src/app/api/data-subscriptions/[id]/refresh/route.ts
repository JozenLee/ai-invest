import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'

export async function POST(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const subscription = await prisma.dataSubscription.findUnique({ include: { instrument: true, datasets: true }, where: { id } })
  if (!subscription) return NextResponse.json({ success: false, error: '订阅不存在' }, { status: 404 })

  const datasets = subscription.datasets.filter((dataset) => dataset.enabled && ['etf_realtime', 'etf_daily', 'etf_holdings', 'constituent_stock_realtime', 'constituent_stock_daily', 'stock_financial', 'stock_announcement'].includes(dataset.datasetKey))
  const runs = await prisma.$transaction(datasets.map((dataset) => prisma.dataFetchRun.create({
    data: { datasetId: dataset.id, targetCode: subscription.instrument.code, status: 'queued', qualityStatus: 'pending' },
  })))
  await prisma.subscriptionDataset.updateMany({ where: { id: { in: datasets.map((dataset) => dataset.id) } }, data: { status: 'queued', lastError: null } })
  let schedulerNotified = false
  try {
    const baseUrl = process.env.DATA_SERVICE_URL || 'http://localhost:8000'
    const response = await fetch(`${baseUrl}/api/data/local/subscriptions/${encodeURIComponent(subscription.instrument.code)}/refresh`, { method: 'POST', signal: AbortSignal.timeout(3000) })
    schedulerNotified = response.ok
  } catch {
    schedulerNotified = false
  }
  return NextResponse.json({ success: true, data: { subscriptionId: id, queuedRuns: runs.length, status: schedulerNotified ? 'dispatched' : 'queued', schedulerNotified } }, { status: 202 })
}
