import { prisma } from '@/lib/db'
import { DEFAULT_RISK_BUDGET } from '@/lib/portfolio/risk-budget'
import type { StepDefinition } from '../types'
export async function capturePortfolioEvidence(industryName?: string) {
  return prisma.$transaction(async tx => {
    const portfolio = await tx.portfolio.findFirst({ orderBy: [{ isDefault: 'desc' }, { createdAt: 'asc' }], include: { holdings: true, user: { include: { settings: true } } } })
    if (!portfolio?.lastSyncedAt) {
      return { excluded: true as const, reason: '尚无已同步持仓；公开研究继续，个人组合投资建议跳过' }
    }
    const info = { name: industryName }
    const emailSnapshot = await tx.rawPayload.findFirst({ where: { datasetKey: 'portfolio_email', targetCode: portfolio.id }, orderBy: { fetchedAt: 'desc' } })
    let emailDates: { holdingsDate?: string; balanceDate?: string } = {}
    try { emailDates = emailSnapshot ? JSON.parse(emailSnapshot.payload) : {} } catch { /* Dates remain unknown. */ }
    const total = portfolio.cashBalance + portfolio.holdings.reduce((sum, row) => sum + row.quantity * row.unitNav, 0)
    const weights = portfolio.holdings.map(row => ({ ticker: row.ticker, name: row.name, category: row.category, industry: row.industryDomain, industryCode:row.industryDomainCode,industryMatchSource:row.industryDomainSource,industryMatchConfidence:row.industryDomainConfidence,weightPct: total > 0 ? row.quantity * row.unitNav / total * 100 : null, marketValue: row.quantity * row.unitNav, quantity: row.quantity, unitNav: row.unitNav, fundType: row.fundType, targetEtfCode: row.targetEtfCode, targetIndexCode: row.targetIndexCode, mappingSource: row.mappingSource, mappingConfidence: row.mappingConfidence, purchaseDate: row.purchaseDate?.toISOString() || null, costNav: row.costNav, redemptionFeePct: row.redemptionFeePct }))
    const settings = portfolio.user.settings
    const riskBudget = settings ? { riskProfile: settings.riskProfile, investHorizon: settings.investHorizon, minCashRatio: settings.minCashRatio, maxIndustryRatio: settings.maxIndustryRatio, maxFundRatio: settings.maxFundRatio, maxSingleAdjustmentRatio: settings.maxSingleAdjustmentRatio, stagedAdjustment: settings.stagedAdjustment } : DEFAULT_RISK_BUDGET
    const evidence = { portfolioId: portfolio.id, source: 'portfolio-email-database', asOf: portfolio.lastSyncedAt.toISOString(), capturedAt: new Date().toISOString(), holdingCount: weights.length, totalAssets: total, cashBalance: portfolio.cashBalance, cashWeightPct: total > 0 ? portfolio.cashBalance / total * 100 : null, topFiveWeightPct: weights.map(row => row.weightPct || 0).sort((a,b) => b-a).slice(0,5).reduce((a,b) => a+b,0), industryWeightPct: weights.filter(row => row.industry === info.name).reduce((sum,row) => sum+(row.weightPct || 0),0), holdings: weights, riskBudget, riskBudgetSource: settings ? 'user-saved' : 'system-default', privacy: '仅在本地确定性规则中计算；未经单独授权不发送至AI，禁止进入社媒正文、摘要、图片。账户持仓按当前有效快照使用，不以同步时间判断新鲜度；行业映射为分类估计。' }
    return { ...evidence, holdingsEmailDate: emailDates.holdingsDate || null, balanceEmailDate: emailDates.balanceDate || null }
  })
}

export const fetchPortfolioStep: StepDefinition = {
  name: 'fetch-portfolio', description: '读取冻结账户快照与产品研究范围', dependencies: ['fetch-etfs'], estimatedDuration: 1000,
  async execute(context) {
    const frozen = context.artifacts.get('frozen-portfolio-evidence')
    if (frozen) {
      await context.saveArtifact('portfolio-evidence', frozen, 'DATA')
      await context.updateProgress(1, 1, '已读取本轮冻结持仓；恢复执行不混入新账户数据')
      return
    }
    if (context.artifacts.has('research-snapshot')) {
      await context.saveArtifact('portfolio-evidence', { excluded: true, reason: '旧轮次未冻结账户，请新建分析以计算个人方案' }, 'DATA')
      return
    }
    await context.saveArtifact('portfolio-evidence', await capturePortfolioEvidence(context.artifacts.get('industry-info')?.name), 'DATA')
  },
}
