import prisma from '@/lib/db/prisma'
import { readPortfolioEmails } from '@/lib/services/portfolio-email.service'
import { fetchFundCategory } from '@/lib/services/fund-category.service'
import { matchHoldingsToGraphIndustries } from '@/lib/services/portfolio-industry-matcher.service'

export async function syncPortfolioFromEmail(portfolioId: string) {
  const parsed = await readPortfolioEmails()
  const holdings = parsed.holdings
  const existingHoldings = await prisma.holding.findMany({ where: { portfolioId } })
  const industryMatches = await matchHoldingsToGraphIndustries(holdings)

  await prisma.$transaction(async tx => {
    await tx.holding.deleteMany({
      where: { portfolioId, ticker: { notIn: holdings.map(holding => holding.ticker) } },
    })
    for (const holding of holdings) {
      const category = await fetchFundCategory(holding.ticker)
      const existing = existingHoldings.find((item) => item.ticker === holding.ticker)
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
        create: { portfolioId, market: 'A', ...holding, ...industryData },
        update: {
          name: holding.name,
          ...(category ? { category } : {}),
          quantity: holding.quantity,
          unitNav: holding.unitNav,
          ...industryData,
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
  })

  return {
    ...parsed,
    holdings,
  }
}
