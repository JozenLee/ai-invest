import prisma from '@/lib/db/prisma'
import { readPortfolioEmails } from '@/lib/services/portfolio-email.service'
import { fetchFundCategory } from '@/lib/services/fund-category.service'
import { matchHoldingsToGraphIndustries } from '@/lib/services/portfolio-industry-matcher.service'
import { verifyPortfolioFundProducts } from '@/lib/services/fund-product-verification.service'
import { ensurePortfolioFundSubscriptions } from '@/lib/portfolio-fund-subscriptions'
import { refreshPortfolioProductResearch } from '@/lib/services/portfolio-product-research.service'

export async function syncPortfolioFromEmail(portfolioId: string) {
  const parsed = await readPortfolioEmails()
  const holdings = parsed.holdings
  const existingHoldings = await prisma.holding.findMany({ where: { portfolioId } })
  const industryMatches = await matchHoldingsToGraphIndustries(holdings)
  if (!holdings.length || holdings.some(row => !Number.isFinite(row.quantity) || row.quantity < 0 || !Number.isFinite(row.unitNav) || row.unitNav <= 0)) throw new Error('持仓凭证校验失败，未修改现有持仓')
  const observedAt = new Date(parsed.holdingsDate || Date.now())
  const safeObservedAt = Number.isFinite(observedAt.getTime()) ? observedAt : new Date()
  const productVerification = await verifyPortfolioFundProducts(portfolioId, holdings.map(holding => {
    const existing = existingHoldings.find(item => item.ticker === holding.ticker)
    const industry = industryMatches[holding.ticker]
    return {
      ...holding,
      industryDomain: existing?.industryDomainSource === 'manual' ? existing.industryDomain : industry?.industryDomain || existing?.industryDomain,
      industryDomainCode: existing?.industryDomainSource === 'manual' ? existing.industryDomainCode : industry?.industryDomainCode || existing?.industryDomainCode,
    }
  }), safeObservedAt)
  const categories = new Map(await Promise.all(holdings.map(async row => [row.ticker, productVerification.get(row.ticker)?.category || await fetchFundCategory(row.ticker)] as const)))

  await prisma.$transaction(async tx => {
    const previous = await tx.portfolio.findUnique({ where: { id: portfolioId } })
    await tx.rawPayload.create({ data: { datasetKey: 'portfolio_email_backup', targetCode: portfolioId, payload: JSON.stringify({ portfolio: previous, holdings: existingHoldings }), contentHash: 'before-email-sync' } })
    await tx.holding.deleteMany({
      where: { portfolioId, ticker: { notIn: holdings.map(holding => holding.ticker) } },
    })
    for (const holding of holdings) {
      const category = categories.get(holding.ticker)
      const existing = existingHoldings.find((item) => item.ticker === holding.ticker)
      const verified = productVerification.get(holding.ticker)
      const industryMatch = industryMatches[holding.ticker]
      const industryData = existing?.industryDomainSource === 'manual'
        ? {}
        : industryMatch
          ? {
              industryDomain: industryMatch.industryDomain,
              industryDomainCode: industryMatch.industryDomainCode ?? null,
              industryDomainSource: industryMatch.source,
              industryDomainConfidence: industryMatch.confidence ?? null,
            }
          : {}
      await tx.holding.upsert({
        where: { portfolioId_ticker: { portfolioId, ticker: holding.ticker } },
        create: {
          portfolioId, market: 'A', ...holding, ...(category ? { category } : {}), ...industryData,
          ...(verified ? {
            fundType: verified.fundType,
            targetEtfCode: verified.targetEtfCode,
            targetIndexCode: verified.targetIndexCode,
            mappingSource: verified.mappingSource,
            mappingConfidence: verified.mappingConfidence,
            mappingEvidence: verified.mappingEvidence,
            firstObservedAt: verified.firstObservedAt,
            redemptionFeePct: verified.redemptionFeePct,
            redemptionFeeSource: verified.redemptionFeeSource,
          } : {}),
        },
        update: {
          name: holding.name,
          ...(category ? { category } : {}),
          quantity: holding.quantity,
          unitNav: holding.unitNav,
          ...industryData,
          ...(verified ? {
            fundType: existing?.fundType || verified.fundType,
            ...((existing?.mappingSource === 'manual') ? {} : {
              targetEtfCode: verified.targetEtfCode,
              targetIndexCode: verified.targetIndexCode,
              mappingSource: verified.mappingSource,
              mappingConfidence: verified.mappingConfidence,
              mappingEvidence: verified.mappingEvidence,
            }),
            firstObservedAt: existing?.firstObservedAt || verified.firstObservedAt,
            ...((existing?.redemptionFeeSource === 'manual') ? {} : {
              redemptionFeePct: verified.redemptionFeePct,
              redemptionFeeSource: verified.redemptionFeeSource,
            }),
          } : {}),
        },
      })
    }
    await tx.portfolio.update({
      where: { id: portfolioId },
      data: {
        cashBalance: parsed.cashBalance,
        lastSyncedAt: new Date(),
        lastSyncEmail: process.env.PORTFOLIO_IMAP_USER ?? 'jozenlee@163.com',
      },
    })
    await tx.rawPayload.create({ data: { datasetKey: 'portfolio_email', targetCode: portfolioId, payload: JSON.stringify({ holdingsDate: parsed.holdingsDate, balanceDate: parsed.balanceDate, holdingCount: holdings.length }), contentHash: 'email-snapshot' } })
  })

  // Public product research is independent from account synchronization. Keep
  // every held fund subscribed, then refresh evidence without sending balances
  // or quantities to the collector.
  await ensurePortfolioFundSubscriptions(holdings)
  await refreshPortfolioProductResearch(holdings.map(item => item.ticker), { timeoutMs: 45_000, totalTimeoutMs: 290_000 })

  return {
    ...parsed,
    holdings,
  }
}
