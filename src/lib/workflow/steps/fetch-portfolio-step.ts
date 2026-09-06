import { prisma } from '@/lib/db'
import type { StepDefinition } from '../types'
export const fetchPortfolioStep: StepDefinition = {
  name: 'fetch-portfolio', description: '读取邮箱持仓，计算组合集中度与产业暴露', dependencies: ['fetch-etfs'], estimatedDuration: 1000,
  async execute(context) {
    const portfolio = await prisma.portfolio.findFirst({ orderBy: [{ isDefault: 'desc' }, { createdAt: 'asc' }], include: { holdings: true, user: { include: { settings: true } } } })
    if (!portfolio?.lastSyncedAt) {
      await context.saveArtifact('portfolio-evidence', { excluded: true, reason: '尚无已同步持仓；公开研究继续，个人组合投资建议跳过' }, 'DATA')
      await context.updateProgress(1,1,'没有可用持仓，已跳过本地组合计算')
      return
    }
    const info = context.artifacts.get('industry-info')
    const emailSnapshot = await prisma.rawPayload.findFirst({ where: { datasetKey: 'portfolio_email', targetCode: portfolio.id }, orderBy: { fetchedAt: 'desc' } })
    const emailDates = emailSnapshot ? JSON.parse(emailSnapshot.payload) : {}
    const total = portfolio.cashBalance + portfolio.holdings.reduce((sum, row) => sum + row.quantity * row.unitNav, 0)
    const weights = portfolio.holdings.map(row => ({ ticker: row.ticker, name: row.name, category: row.category, industry: row.industryDomain, weightPct: total > 0 ? row.quantity * row.unitNav / total * 100 : null, marketValue: row.quantity * row.unitNav, quantity: row.quantity, unitNav: row.unitNav, industryMatchSource: row.industryDomainSource, fundType: row.fundType, targetEtfCode: row.targetEtfCode, targetIndexCode: row.targetIndexCode, mappingSource: row.mappingSource, mappingConfidence: row.mappingConfidence, purchaseDate: row.purchaseDate?.toISOString() || null, costNav: row.costNav, redemptionFeePct: row.redemptionFeePct }))
    const settings = portfolio.user.settings
    const riskBudget = { riskProfile: settings?.riskProfile || 'moderate', investHorizon: settings?.investHorizon || 'medium', minCashRatio: settings?.minCashRatio ?? settings?.cashRatio ?? .1, maxIndustryRatio: settings?.maxIndustryRatio ?? .2, maxFundRatio: settings?.maxFundRatio ?? .15, maxSingleAdjustmentRatio: settings?.maxSingleAdjustmentRatio ?? .05, stagedAdjustment: settings?.stagedAdjustment ?? true }
    const evidence = { source: 'portfolio-email-database', asOf: portfolio.lastSyncedAt, holdingCount: weights.length, totalAssets: total, cashBalance: portfolio.cashBalance, cashWeightPct: total > 0 ? portfolio.cashBalance / total * 100 : null, topFiveWeightPct: weights.map(row => row.weightPct || 0).sort((a,b) => b-a).slice(0,5).reduce((a,b) => a+b,0), industryWeightPct: weights.filter(row => row.industry === info.name).reduce((sum,row) => sum+(row.weightPct || 0),0), holdings: weights, riskBudget, privacy: '仅在本地确定性规则中计算；未经单独授权不发送至AI，禁止进入社媒正文、摘要、图片。净值日期不等于同步时间；行业映射为分类估计。' }
    await context.saveArtifact('portfolio-evidence', { ...evidence, holdingsEmailDate: emailDates.holdingsDate || null, balanceEmailDate: emailDates.balanceDate || null }, 'DATA')
    await context.updateProgress(1,1, '读取 ' + weights.length + ' 项持仓；只向AI提供比例，不提供账户金额')
  }
}
