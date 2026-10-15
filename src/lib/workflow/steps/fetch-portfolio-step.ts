import { prisma } from '@/lib/db'
import type { StepDefinition } from '../types'
import { confirmedPortfolioDate } from '@/lib/portfolio/snapshot-provenance'

function sourceDate(value: unknown) {
  if (typeof value !== 'string' || !value.trim()) return null
  const parsed = Date.parse(value.replace(/\s+\([^)]*\)\s*$/, ''))
  return Number.isFinite(parsed) ? new Date(parsed).toISOString() : null
}

export async function capturePortfolioEvidence(industryName?: string) {
  return prisma.$transaction(async tx => {
    const portfolio = await tx.portfolio.findFirst({ orderBy: [{ isDefault: 'desc' }, { createdAt: 'asc' }], include: { holdings: true, user: { include: { settings: true } } } })
    if (!portfolio?.lastSyncedAt) return { excluded: true as const, reason: '尚无已同步持仓；公开研究继续，个人组合投资建议跳过' }
    const emailSnapshot = await tx.rawPayload.findFirst({ where: { datasetKey: 'portfolio_email', targetCode: portfolio.id }, orderBy: { fetchedAt: 'desc' } })
    let emailDates: { holdingsDate?: string; balanceDate?: string } = {}
    try { emailDates = emailSnapshot ? JSON.parse(emailSnapshot.payload) : {} } catch { /* keep unknown */ }
    const holdingsSourceAsOf = sourceDate(emailDates.holdingsDate)
    const balanceSourceAsOf = sourceDate(emailDates.balanceDate)
    const sourceTimes = [holdingsSourceAsOf, balanceSourceAsOf].filter((value): value is string => !!value).map(Date.parse)
    const manualRow=await tx.rawPayload.findFirst({where:{datasetKey:'portfolio_manual_confirmation',targetCode:portfolio.id},orderBy:{fetchedAt:'desc'}})
    let manualDate:string|null=null
    try{manualDate=confirmedPortfolioDate(manualRow?JSON.parse(manualRow.payload):null,portfolio.cashBalance,portfolio.holdings)}catch{}
    const emailAsOf = sourceTimes.length === 2 ? new Date(Math.min(...sourceTimes)).toISOString() : null
    const sourceAsOf=manualDate&&(!emailAsOf||manualDate>emailAsOf)?manualDate:emailAsOf
    const total = portfolio.cashBalance + portfolio.holdings.reduce((sum, row) => sum + row.quantity * row.unitNav, 0)
    const holdings = portfolio.holdings.map(row => ({ ticker: row.ticker, name: row.name, category: row.category, industry: row.industryDomain, industryCode: row.industryDomainCode, industryMatchSource: row.industryDomainSource, industryMatchConfidence: row.industryDomainConfidence, weightPct: total > 0 ? row.quantity * row.unitNav / total * 100 : null, marketValue: row.quantity * row.unitNav, quantity: row.quantity, unitNav: row.unitNav, fundType: row.fundType, targetEtfCode: row.targetEtfCode, targetIndexCode: row.targetIndexCode, mappingSource: row.mappingSource, mappingConfidence: row.mappingConfidence, mappingEvidence: row.mappingEvidence, firstObservedAt: row.firstObservedAt?.toISOString() || null, purchaseDate: row.purchaseDate?.toISOString() || null, costNav: row.costNav, redemptionFeePct: row.redemptionFeePct, redemptionFeeSource: row.redemptionFeeSource }))
    const settings = portfolio.user.settings
    const riskBudget = { riskProfile: settings?.riskProfile || 'moderate', investHorizon: settings?.investHorizon || 'medium', minCashRatio: settings?.minCashRatio ?? settings?.cashRatio ?? .1, maxIndustryRatio: settings?.maxIndustryRatio ?? .2, maxFundRatio: settings?.maxFundRatio ?? .15, maxSingleAdjustmentRatio: settings?.maxSingleAdjustmentRatio ?? .05, stagedAdjustment: settings?.stagedAdjustment ?? true }
    return { portfolioId: portfolio.id, source: manualDate&&sourceAsOf===manualDate?'user-confirmed-account':'portfolio-email-database', asOf: sourceAsOf, sourceAsOf, syncedAt: portfolio.lastSyncedAt.toISOString(), capturedAt: new Date().toISOString(), holdingCount: holdings.length, totalAssets: total, cashBalance: portfolio.cashBalance, cashWeightPct: total > 0 ? portfolio.cashBalance / total * 100 : null, topFiveWeightPct: holdings.map(row => row.weightPct || 0).sort((a,b) => b-a).slice(0,5).reduce((a,b) => a+b,0), industryWeightPct: holdings.filter(row => row.industry === industryName).reduce((sum,row) => sum+(row.weightPct || 0),0), holdings, riskBudget, holdingsEmailDate: emailDates.holdingsDate || null, balanceEmailDate: emailDates.balanceDate || null, holdingsSourceAsOf, balanceSourceAsOf, privacy: '仅在本地确定性规则中计算；基金公开研究仅使用公开产品代码，不发送账户金额、份额或批次。' }
  })
}

export const fetchPortfolioStep: StepDefinition = {
  name: 'fetch-portfolio', description: '读取冻结账户快照与基金产品研究', dependencies: ['fetch-etfs'], estimatedDuration: 1000,
  async execute(context) {
    const frozen = context.artifacts.get('frozen-portfolio-evidence')
    const evidence = frozen || await capturePortfolioEvidence(context.artifacts.get('industry-info')?.name)
    await context.saveArtifact('portfolio-evidence', evidence, 'DATA')
    await context.updateProgress(1, 1, evidence.excluded ? '没有可用持仓，已跳过本地组合计算' : `读取 ${evidence.holdingCount} 项持仓及冻结基金研究证据`)
  },
}
