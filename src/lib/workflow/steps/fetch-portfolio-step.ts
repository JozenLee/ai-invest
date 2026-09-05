import { prisma } from '@/lib/db'
import type { StepDefinition } from '../types'
export const fetchPortfolioStep: StepDefinition = {
  name: 'fetch-portfolio', description: '读取邮箱持仓，计算组合集中度与产业暴露', dependencies: ['fetch-etfs'], estimatedDuration: 1000,
  async execute(context) {
    if (context.input.publicOnly) {
      await context.saveArtifact('portfolio-evidence', { excluded: true, reason: '自动发布仅使用公开研究数据' }, 'DATA')
      return
    }
    const portfolio = await prisma.portfolio.findFirst({ orderBy: [{ isDefault: 'desc' }, { createdAt: 'asc' }], include: { holdings: true } })
    if (!portfolio?.lastSyncedAt) throw new Error('尚无邮箱同步持仓，请先在持仓总览同步')
    const info = context.artifacts.get('industry-info')
    const emailSnapshot = await prisma.rawPayload.findFirst({ where: { datasetKey: 'portfolio_email', targetCode: portfolio.id }, orderBy: { fetchedAt: 'desc' } })
    const emailDates = emailSnapshot ? JSON.parse(emailSnapshot.payload) : {}
    const total = portfolio.cashBalance + portfolio.holdings.reduce((sum, row) => sum + row.quantity * row.unitNav, 0)
    const weights = portfolio.holdings.map(row => ({ ticker: row.ticker, name: row.name, category: row.category, industry: row.industryDomain, weightPct: total > 0 ? row.quantity * row.unitNav / total * 100 : null, industryMatchSource: row.industryDomainSource }))
    const evidence = { source: 'portfolio-email-database', asOf: portfolio.lastSyncedAt, holdingCount: weights.length, cashWeightPct: total > 0 ? portfolio.cashBalance / total * 100 : null, topFiveWeightPct: weights.map(row => row.weightPct || 0).sort((a,b) => b-a).slice(0,5).reduce((a,b) => a+b,0), industryWeightPct: weights.filter(row => row.industry === info.name).reduce((sum,row) => sum+(row.weightPct || 0),0), holdings: weights, privacy: '私有分析；禁止进入社媒正文、摘要、图片。净值日期不等于同步时间；行业映射为分类估计。' }
    await context.saveArtifact('portfolio-evidence', { ...evidence, holdingsEmailDate: emailDates.holdingsDate || null, balanceEmailDate: emailDates.balanceDate || null }, 'DATA')
    await context.updateProgress(1,1, '读取 ' + weights.length + ' 项持仓；只向AI提供比例，不提供账户金额')
  }
}
