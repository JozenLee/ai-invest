import { prisma } from '@/lib/db'
import { notifySubscriptionWorker } from '@/lib/subscription-dispatch'
import { getSubscriptionConfig } from '@/lib/subscription-config-store'
import type { SubscriptionScope } from '@/lib/subscription-config'

export const SUBSCRIPTION_SCOPES: SubscriptionScope[] = ['market_index', 'etf_index', 'company_quote', 'portfolio_fund']

export class NoSubscriptionTargetsError extends Error {}
export class SubscriptionDispatchError extends Error {}

type RefreshSelection = { scope?: SubscriptionScope; datasetKey?: string; subscriptionId?: string }

/** Single queue/claim/dispatch path used by module, dataset and instrument refreshes. */
export async function queueSubscriptionRefresh(selection: RefreshSelection) {
  const config = await getSubscriptionConfig()
  const keys = Object.entries(config.policies)
    .filter(([, policy]) => !selection.scope || policy.scope === selection.scope)
    .map(([key]) => key)
  if (selection.datasetKey && !keys.includes(selection.datasetKey)) throw new Error('无效数据类型')
  const selectedKeys = selection.datasetKey ? [selection.datasetKey] : keys
  const instrumentType = selection.scope === 'market_index' ? 'INDEX' : selection.scope === 'portfolio_fund' ? 'FUND' : selection.scope ? 'ETF' : null
  const subscriptions = await prisma.dataSubscription.findMany({
    where: {
      enabled: true,
      ...(selection.subscriptionId ? { id: selection.subscriptionId } : {}),
      ...(instrumentType ? { instrument: { type: instrumentType } } : {}),
    },
    include: { instrument: true, datasets: true },
  })
  const targets = subscriptions.flatMap(subscription => subscription.datasets
    .filter(dataset => dataset.enabled && selectedKeys.includes(dataset.datasetKey))
    .map(dataset => ({ ...dataset, code: subscription.instrument.code })))
  if (!targets.length) throw new NoSubscriptionTargetsError('没有可同步的订阅数据')

  const runIds = await prisma.$transaction(async tx => {
    const ids: string[] = []
    for (const dataset of targets) {
      const claimed = await tx.subscriptionDataset.updateMany({ where: { id: dataset.id, status: { notIn: ['queued', 'running'] } }, data: { status: 'queued', nextRunAt: new Date(), lastError: null } })
      if (!claimed.count) continue
      const run = await tx.dataFetchRun.create({ data: { datasetId: dataset.id, targetCode: dataset.code, status: 'queued', qualityStatus: 'pending' } })
      ids.push(run.id)
    }
    return ids
  }, { timeout: 15000 })

  try {
    await notifySubscriptionWorker()
  } catch (error) {
    const message = error instanceof Error ? error.message : '数据服务不可用'
    await prisma.$transaction(async tx => {
      const queued = await tx.dataFetchRun.findMany({ where: { id: { in: runIds }, status: 'queued' }, select: { id: true, datasetId: true } })
      await tx.dataFetchRun.updateMany({ where: { id: { in: queued.map(run => run.id) }, status: 'queued' }, data: { status: 'failed', error: message, qualityStatus: 'unavailable', completedAt: new Date() } })
      await tx.subscriptionDataset.updateMany({ where: { id: { in: queued.map(run => run.datasetId) }, status: 'queued' }, data: { status: 'failed', lastError: message, nextRunAt: new Date(Date.now() + 300000) } })
    })
    throw new SubscriptionDispatchError(message)
  }

  const active = await prisma.dataFetchRun.findMany({ where: { datasetId: { in: targets.map(dataset => dataset.id) }, status: { in: ['queued', 'running'] } }, select: { id: true } })
  return { queuedDatasets: runIds.length, runIds: [...new Set([...runIds, ...active.map(run => run.id)])] }
}
