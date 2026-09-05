import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { syncGraphEtfSubscriptions } from '@/lib/data-subscription-overview'
import { notifySubscriptionWorker } from '@/lib/subscription-dispatch'
import { ensureMarketIndexSubscriptions } from '@/lib/market-index-subscriptions'
import { DEFAULT_SUBSCRIPTION_CONFIG, type SubscriptionScope } from '@/lib/subscription-config'

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({})) as { scope?: SubscriptionScope; datasetKey?: string }
    const scope = body.scope
    if (scope && !['market_index', 'etf_index', 'company_quote'].includes(scope)) return NextResponse.json({ success: false, error: '无效订阅类型' }, { status: 400 })
    if (scope === 'market_index') await ensureMarketIndexSubscriptions()
    else await syncGraphEtfSubscriptions()
    const keys = Object.entries(DEFAULT_SUBSCRIPTION_CONFIG.policies).filter(([, policy]) => !scope || policy.scope === scope).map(([key]) => key)
    if (body.datasetKey && !keys.includes(body.datasetKey)) return NextResponse.json({ success: false, error: '无效数据类型' }, { status: 400 })
    const selectedKeys = body.datasetKey ? [body.datasetKey] : keys
    const subscriptions = await prisma.dataSubscription.findMany({ where: { enabled: true, instrument: { type: scope === 'market_index' ? 'INDEX' : 'ETF' } }, include: { instrument: true, datasets: true } })
    const targets = subscriptions.flatMap((subscription) => subscription.datasets.filter((dataset) => dataset.enabled && selectedKeys.includes(dataset.datasetKey)).map((dataset) => ({ ...dataset, code: subscription.instrument.code })))
    if (!targets.length) return NextResponse.json({ success: false, error: '没有可同步的订阅数据' }, { status: 409 })
    const runs = await prisma.$transaction(async (tx) => {
      const ids: string[] = []
      for (const dataset of targets) {
        // Claim using the current state, not the earlier overview snapshot.
        const claimed = await tx.subscriptionDataset.updateMany({ where: { id: dataset.id, status: { notIn: ['queued', 'running'] } }, data: { status: 'queued', nextRunAt: new Date(), lastError: null } })
        if (claimed.count) {
          const run = await tx.dataFetchRun.create({ data: { datasetId: dataset.id, targetCode: dataset.code, status: 'queued', qualityStatus: 'pending' } })
          ids.push(run.id)
        }
      }
      return ids
    }, { timeout: 15000 })
    try {
      await notifySubscriptionWorker()
    } catch (error) {
      const message = error instanceof Error ? error.message : '数据服务不可用'
      await prisma.$transaction(async (tx) => {
        const queued = await tx.dataFetchRun.findMany({ where: { id: { in: runs }, status: 'queued' }, select: { id: true, datasetId: true } })
        await tx.dataFetchRun.updateMany({ where: { id: { in: queued.map((run) => run.id) }, status: 'queued' }, data: { status: 'failed', error: message, qualityStatus: 'unavailable', completedAt: new Date() } })
        await tx.subscriptionDataset.updateMany({ where: { id: { in: queued.map((run) => run.datasetId) }, status: 'queued' }, data: { status: 'failed', lastError: message, nextRunAt: new Date(Date.now() + 300000) } })
      })
      return NextResponse.json({ success: false, error: message }, { status: 503 })
    }
    const active = await prisma.dataFetchRun.findMany({ where: { datasetId: { in: targets.map((dataset) => dataset.id) }, status: { in: ['queued', 'running'] } }, select: { id: true } })
    return NextResponse.json({ success: true, data: { queuedDatasets: runs.length, runIds: [...new Set([...runs, ...active.map((run) => run.id)])] } }, { status: 202 })
  } catch (error) {
    return NextResponse.json({ success: false, error: error instanceof Error ? error.message : '同步失败' }, { status: 500 })
  }
}
