import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { notifySubscriptionWorker } from '@/lib/subscription-dispatch'

export async function POST(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const subscription = await prisma.dataSubscription.findUnique({ include: { instrument: true, datasets: true }, where: { id } })
  if (!subscription) return NextResponse.json({ success: false, error: '订阅不存在' }, { status: 404 })
  if (!subscription.enabled) return NextResponse.json({ success: false, error: '订阅已停用' }, { status: 409 })

  const datasets = subscription.datasets.filter((dataset) => dataset.enabled && ['etf_realtime', 'etf_daily', 'etf_holdings', 'etf_research', 'constituent_stock_realtime', 'constituent_stock_daily', 'stock_financial', 'stock_announcement'].includes(dataset.datasetKey))
  const queueable = datasets.filter((dataset) => !['queued', 'running'].includes(dataset.status))
  const activeRuns = await prisma.dataFetchRun.findMany({ where: { datasetId: { in: datasets.filter((dataset) => !queueable.includes(dataset)).map((dataset) => dataset.id) }, status: { in: ['queued', 'running'] } }, select: { id: true } })
  const results = await prisma.$transaction([...queueable.map((dataset) => prisma.dataFetchRun.create({
    data: { datasetId: dataset.id, targetCode: subscription.instrument.code, status: 'queued', qualityStatus: 'pending' },
  })), prisma.subscriptionDataset.updateMany({ where: { id: { in: queueable.map((dataset) => dataset.id) } }, data: { status: 'queued', nextRunAt: new Date(), lastError: null } })])
  const runs = results.filter((run): run is typeof run & { id: string } => 'id' in run)
  try {
    await notifySubscriptionWorker()
  } catch (error) {
    const message = error instanceof Error ? error.message : '数据服务不可用'
    await prisma.$transaction([
      prisma.dataFetchRun.updateMany({ where: { id: { in: runs.map((run) => run.id) }, status: 'queued' }, data: { status: 'failed', error: message, completedAt: new Date(), qualityStatus: 'unavailable' } }),
      prisma.subscriptionDataset.updateMany({ where: { id: { in: queueable.map((dataset) => dataset.id) }, status: 'queued' }, data: { status: 'failed', lastError: message, nextRunAt: new Date(Date.now() + 300000) } }),
    ])
    return NextResponse.json({ success: false, error: message }, { status: 503 })
  }
  return NextResponse.json({ success: true, data: { subscriptionId: id, queuedRuns: runs.length, runIds: [...activeRuns.map((run) => run.id), ...runs.map((run) => run.id)], status: 'dispatched', schedulerNotified: true } }, { status: 202 })
}
