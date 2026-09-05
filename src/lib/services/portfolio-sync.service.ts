import prisma from '@/lib/db/prisma'
import { readPortfolioEmails } from '@/lib/services/portfolio-email.service'
import { fetchFundCategory } from '@/lib/services/fund-category.service'
import { matchHoldingsToGraphIndustries } from '@/lib/services/portfolio-industry-matcher.service'

export async function syncPortfolioFromEmail(portfolioId: string) {
  const parsed = await readPortfolioEmails()
  const holdings = parsed.holdings
  const existingHoldings = await prisma.holding.findMany({ where: { portfolioId } })
  const industryMatches = await matchHoldingsToGraphIndustries(holdings)
  if (!holdings.length || holdings.some(row => !Number.isFinite(row.quantity) || row.quantity < 0 || !Number.isFinite(row.unitNav) || row.unitNav <= 0)) throw new Error('持仓凭证校验失败，未修改现有持仓')
  const categories = new Map(await Promise.all(holdings.map(async row => [row.ticker, await fetchFundCategory(row.ticker)] as const)))

  await prisma.$transaction(async tx => {
    const previous = await tx.portfolio.findUnique({ where: { id: portfolioId } })
    await tx.rawPayload.create({ data: { datasetKey: 'portfolio_email_backup', targetCode: portfolioId, payload: JSON.stringify({ portfolio: previous, holdings: existingHoldings }), contentHash: 'before-email-sync' } })
    await tx.holding.deleteMany({
      where: { portfolioId, ticker: { notIn: holdings.map(holding => holding.ticker) } },
    })
    for (const holding of holdings) {
      const category = categories.get(holding.ticker)
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
        create: { portfolioId, market: 'A', ...holding, ...(category ? { category } : {}), ...industryData },
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
    await tx.rawPayload.create({ data: { datasetKey: 'portfolio_email', targetCode: portfolioId, payload: JSON.stringify({ holdingsDate: parsed.holdingsDate, balanceDate: parsed.balanceDate, holdingCount: holdings.length }), contentHash: 'email-snapshot' } })
  })

  return {
    ...parsed,
    holdings,
  }
}
