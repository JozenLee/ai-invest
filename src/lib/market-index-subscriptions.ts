import { prisma } from '@/lib/db'
import { MARKET_INDEXES, DEFAULT_SUBSCRIPTION_CONFIG } from '@/lib/subscription-config'
import { getSubscriptionConfig } from '@/lib/subscription-config-store'

export async function ensureMarketIndexSubscriptions() {
  const existing = await prisma.dataSubscription.findMany({ where: { instrument: { type: 'INDEX', code: { in: MARKET_INDEXES.map((index) => index.code) } } }, include: { instrument: true, datasets: true } })
  const keysFor = (code: string) => Object.entries(DEFAULT_SUBSCRIPTION_CONFIG.policies).filter(([key, policy]) => policy.scope === 'market_index' && (key.startsWith('index_') || code === MARKET_INDEXES[0].code)).map(([key]) => key)
  if (existing.length === MARKET_INDEXES.length && existing.every((item) => keysFor(item.instrument.code).every((key) => item.datasets.some((dataset) => dataset.datasetKey === key)))) return
  const config = await getSubscriptionConfig()
  for (const index of MARKET_INDEXES) {
    const instrument = await prisma.instrument.upsert({ where: { type_code: { type: 'INDEX', code: index.code } }, create: { type: 'INDEX', ...index }, update: {} })
    const subscription = await prisma.dataSubscription.upsert({ where: { instrumentId: instrument.id }, create: { instrumentId: instrument.id, profile: 'market_index' }, update: {} })
    for (const key of keysFor(index.code)) {
      const policy = config.policies[key]
      await prisma.subscriptionDataset.upsert({ where: { subscriptionId_datasetKey: { subscriptionId: subscription.id, datasetKey: key } }, create: { subscriptionId: subscription.id, datasetKey: key, tradingIntervalSeconds: policy.tradingIntervalSeconds, closedIntervalSeconds: policy.closedIntervalSeconds }, update: {} })
    }
  }
}
