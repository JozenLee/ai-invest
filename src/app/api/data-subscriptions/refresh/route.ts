import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { syncGraphEtfSubscriptions } from '@/lib/data-subscription-overview'
import { ensureMarketIndexSubscriptions } from '@/lib/market-index-subscriptions'
import type { SubscriptionScope } from '@/lib/subscription-config'
import { ensurePortfolioFundSubscriptions } from '@/lib/portfolio-fund-subscriptions'
import { NoSubscriptionTargetsError, queueSubscriptionRefresh, SUBSCRIPTION_SCOPES, SubscriptionDispatchError } from '@/lib/subscription-refresh'

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({})) as { scope?: SubscriptionScope; datasetKey?: string }
    const scope = body.scope
    if (scope && !SUBSCRIPTION_SCOPES.includes(scope)) return NextResponse.json({ success: false, error: '无效订阅类型' }, { status: 400 })
    if (scope === 'market_index') {
      await ensureMarketIndexSubscriptions()
      // Graph mappings can introduce additional tracked indices.
      await syncGraphEtfSubscriptions()
    }
    else if (scope === 'portfolio_fund') {
      const portfolios = await prisma.portfolio.findMany({ include: { holdings: { select: { ticker: true, name: true } } } })
      await ensurePortfolioFundSubscriptions(portfolios.flatMap(portfolio => portfolio.holdings))
    } else {
      await syncGraphEtfSubscriptions()
      if (!scope) {
        await ensureMarketIndexSubscriptions()
        const portfolios = await prisma.portfolio.findMany({ include: { holdings: { select: { ticker: true, name: true } } } })
        await ensurePortfolioFundSubscriptions(portfolios.flatMap(portfolio => portfolio.holdings))
      }
    }
    return NextResponse.json({ success: true, data: await queueSubscriptionRefresh({ scope, datasetKey: body.datasetKey }) }, { status: 202 })
  } catch (error) {
    const status = error instanceof NoSubscriptionTargetsError ? 409 : error instanceof SubscriptionDispatchError ? 503 : error instanceof Error && error.message === '无效数据类型' ? 400 : 500
    return NextResponse.json({ success: false, error: error instanceof Error ? error.message : '同步失败' }, { status })
  }
}
