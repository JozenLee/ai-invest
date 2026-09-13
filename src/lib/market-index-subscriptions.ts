import { prisma } from '@/lib/db'
import { MARKET_INDEXES, DEFAULT_SUBSCRIPTION_CONFIG } from '@/lib/subscription-config'
import { getSubscriptionConfig } from '@/lib/subscription-config-store'

export type SubscribedMarketIndex = { code: string; name: string }

/**
 * All index subscriptions use the same INDEX pipeline. Cross-market datasets
 * live only on the primary benchmark; graph-discovered indices receive the two
 * instrument-specific quote/K-line datasets.
 */
export async function ensureIndexSubscriptions(indexes: readonly SubscribedMarketIndex[], includeGlobalDatasets = false) {
  const unique = [...new Map(indexes.filter(index => index.code).map(index => [index.code, index])).values()]
  if (!unique.length) return 0
  const primaryCode = MARKET_INDEXES[0].code
  const keysFor = (code: string) => Object.entries(DEFAULT_SUBSCRIPTION_CONFIG.policies)
    .filter(([key, policy]) => policy.scope === 'market_index' && (key.startsWith('index_') || (includeGlobalDatasets && code === primaryCode)))
    .map(([key]) => key)
  const existing = await prisma.dataSubscription.findMany({ where: { instrument: { type: 'INDEX', code: { in: unique.map(index => index.code) } } }, include: { instrument: true, datasets: true } })
  if (existing.length === unique.length && existing.every((item) => keysFor(item.instrument.code).every((key) => item.datasets.some((dataset) => dataset.datasetKey === key)))) return unique.length
  const config = await getSubscriptionConfig()
  for (const index of unique) {
    const instrument = await prisma.instrument.upsert({ where: { type_code: { type: 'INDEX', code: index.code } }, create: { type: 'INDEX', ...index }, update: { name: index.name, status: 'active' } })
    const subscription = await prisma.dataSubscription.upsert({ where: { instrumentId: instrument.id }, create: { instrumentId: instrument.id, profile: 'market_index' }, update: {} })
    for (const key of keysFor(index.code)) {
      const policy = config.policies[key]
      await prisma.subscriptionDataset.upsert({ where: { subscriptionId_datasetKey: { subscriptionId: subscription.id, datasetKey: key } }, create: { subscriptionId: subscription.id, datasetKey: key, tradingIntervalSeconds: policy.tradingIntervalSeconds, closedIntervalSeconds: policy.closedIntervalSeconds }, update: {} })
    }
  }
  return unique.length
}

export async function ensureMarketIndexSubscriptions() {
  return ensureIndexSubscriptions(MARKET_INDEXES, true)
}
