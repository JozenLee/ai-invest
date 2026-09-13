import { prisma } from '@/lib/db'
import { DEFAULT_SUBSCRIPTION_CONFIG } from '@/lib/subscription-config'

/** Keep public fund research warm independently from report generation. */
export async function ensurePortfolioFundSubscriptions(holdings: readonly { ticker: string; name?: string | null }[]) {
  const policy = DEFAULT_SUBSCRIPTION_CONFIG.policies.fund_research
  if (!policy) throw new Error('缺少场外基金研究订阅策略')
  const funds = [...new Map(holdings.filter(item => /^\d{6}$/.test(item.ticker)).map(item => [item.ticker, item])).values()]
  for (const fund of funds) {
    const instrument = await prisma.instrument.upsert({
      where: { type_code: { type: 'FUND', code: fund.ticker } },
      create: { type: 'FUND', code: fund.ticker, name: fund.name || fund.ticker, market: 'CN' },
      update: { ...(fund.name ? { name: fund.name } : {}), status: 'active' },
    })
    const subscription = await prisma.dataSubscription.upsert({
      where: { instrumentId: instrument.id },
      create: { instrumentId: instrument.id, enabled: true, profile: JSON.stringify({ source: 'portfolio-holding' }) },
      update: { enabled: true },
    })
    await prisma.subscriptionDataset.upsert({
      where: { subscriptionId_datasetKey: { subscriptionId: subscription.id, datasetKey: 'fund_research' } },
      create: { subscriptionId: subscription.id, datasetKey: 'fund_research', enabled: true, tradingIntervalSeconds: policy.tradingIntervalSeconds, closedIntervalSeconds: policy.closedIntervalSeconds, nextRunAt: new Date() },
      update: { enabled: true },
    })
  }
  return funds.length
}
