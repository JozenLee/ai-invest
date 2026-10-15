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

/** A verified held-fund relationship must be sufficient to bring its ETF into
 * the research universe; it must not depend on a pre-existing graph subscription. */
export async function ensureUnderlyingEtfSubscription(code:string,name?:string|null){
  if(!/^\d{6}$/.test(code))throw new Error(`无效底层ETF代码: ${code}`)
  const instrument=await prisma.instrument.upsert({where:{type_code:{type:'ETF',code}},create:{type:'ETF',code,name:name||code,market:'CN'},update:{...(name?{name}:{}),status:'active'}})
  const subscription=await prisma.dataSubscription.upsert({where:{instrumentId:instrument.id},create:{instrumentId:instrument.id,enabled:true,profile:JSON.stringify({source:'verified-portfolio-underlying'})},update:{enabled:true}})
  for(const datasetKey of ['etf_research','etf_daily','etf_holdings','etf_realtime'] as const){
    const policy=DEFAULT_SUBSCRIPTION_CONFIG.policies[datasetKey]
    if(!policy)continue
    await prisma.subscriptionDataset.upsert({where:{subscriptionId_datasetKey:{subscriptionId:subscription.id,datasetKey}},create:{subscriptionId:subscription.id,datasetKey,enabled:true,tradingIntervalSeconds:policy.tradingIntervalSeconds,closedIntervalSeconds:policy.closedIntervalSeconds,nextRunAt:new Date()},update:{enabled:true,nextRunAt:new Date()}})
  }
  return instrument
}
