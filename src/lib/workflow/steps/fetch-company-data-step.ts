import { prisma } from '@/lib/db'
import { freshEvidence, financialRatios } from '@/lib/analysis/evidence'
import { financialView, announcementView, marketDetail } from '@/lib/market-detail'
import type { StepDefinition } from '../types'
export const fetchCompanyDataStep: StepDefinition = {
  name: 'fetch-company-data', description: '读取企业行情、财报与公告证据', dependencies: ['fetch-companies'], estimatedDuration: 1000,
  async execute(context) {
    const companies = (context.artifacts.get('companies') || []) as any[]
    const data = await Promise.all(companies.map(async (company) => {
      const code = company.stockCode
      const [daily, quote, financials, announcements] = await Promise.all([
        prisma.stockDaily.findMany({ where: { ticker: code, close: { gt: 0 } }, orderBy: { date: 'desc' }, take: 120 }),
        prisma.marketQuote.findUnique({ where: { instrumentType_code: { instrumentType: 'STOCK', code } } }),
        prisma.stockFinancialReport.findMany({ where: { stockCode: code }, orderBy: { reportPeriod: 'desc' }, take: 6 }),
        prisma.stockAnnouncement.findMany({ where: { stockCode: code }, orderBy: { publishDate: 'desc' }, take: 10 }),
      ])
      const detail = marketDetail(daily, quote, 120)
      if (!freshEvidence(detail.history.at(-1)?.date)) { detail.history = []; detail.metrics = marketDetail([], null, 120).metrics }
      return { ...company, marketData: detail.history.length ? { ...detail.history.at(-1), price: detail.history.at(-1)!.close, changePct: detail.metrics.latestChangePct, source: quote?.source || 'subscription-database', fetchedAt: quote?.fetchedAt } : null,
        history: detail.history, indicators: detail.metrics,
        financials: financials.map((row) => ({ ...financialView(row), fetchedAt: row.fetchedAt })).filter(row => freshEvidence(row.publishDate || row.period, 550) && row.metrics.length).map(row => ({ ...row, calculated: financialRatios(row.metrics) })),
        announcements: announcements.filter(row => row.title.trim() && freshEvidence(row.publishDate, 90)).map(announcementView), quality: { source: 'subscription-database', historyPoints: detail.history.length, hasFinancials: financials.length > 0, hasAnnouncements: announcements.length > 0 } }
    }))
    await context.saveArtifact('company-market-data', data, 'DATA')
    await context.updateProgress(1, 1, '企业订阅证据读取完成')
  }
}
