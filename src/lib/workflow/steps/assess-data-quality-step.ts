import { assessSubscriptionQuality } from '@/lib/analysis/subscription-quality'
import { etfActionStep } from './etf-action-step'
import type { StepDefinition } from '../types'
export const assessDataQualityStep: StepDefinition = {
  name: 'assess-data-quality', description: '校验订阅数据时效、覆盖度与证据缺口',
  dependencies: ['calculate-market-trends', 'fetch-news', 'fetch-company-data', 'fetch-etf-holdings'], estimatedDuration: 1000,
  async execute(context) {
    const frozenQuality = context.artifacts.get('research-snapshot')?.projections?.['assess-data-quality']?.['data-quality']
    if (frozenQuality) {
      await context.saveArtifact('data-quality', frozenQuality, 'DATA')
      context.artifacts.set('data-quality', frozenQuality)
      if (frozenQuality.status === 'blocked') throw new Error('冻结数据质量门禁未通过，请补齐数据后新建分析')
      await etfActionStep.execute(context)
      await context.updateProgress(1, 1, '已完成数据质量检查与内部产品规则评估')
      return
    }
    const etfs = (context.artifacts.get('etf-market-data') || []) as Array<{dataDate?:string;history?:unknown[];ticker?:string;qualityWarning?:string;discontinuities?:unknown}>
    const companies = (context.artifacts.get('company-market-data') || []) as Array<{marketData?:unknown;financials?:unknown[];announcements?:unknown[]}>
    const requested = String(context.artifacts.get('etf-codes') || '').split(',').filter(Boolean).length
    const quality = { ...assessSubscriptionQuality(etfs, requested), source: 'subscription-database', evaluatedAt: new Date().toISOString(), companyCoverage: { total: companies.length, quotes: companies.filter((row) => row.marketData).length, financials: companies.filter((row) => row.financials?.length).length, announcements: companies.filter((row) => row.announcements?.length).length }, newsCount: ((context.artifacts.get('news-articles') || []) as unknown[]).length }
    const adjustmentWarnings = etfs.filter(row => row.qualityWarning).map(row => ({ ticker: row.ticker, warning: row.qualityWarning, discontinuities: row.discontinuities }))
    await context.saveArtifact('data-quality', { ...quality, status: quality.status === 'available' && adjustmentWarnings.length ? 'limited' : quality.status, adjustmentWarnings, countUnits: 'requested、available、usable都是ETF只数，不是历史数据点数；coverage是ETF覆盖比例。', historyPointsByEtf: etfs.map(row => ({ ticker: row.ticker, points: row.history?.length || 0, asOf: row.dataDate })) }, 'DATA')
    if (quality.status === 'blocked') throw new Error('订阅数据质量门禁未通过：缺少近7天且至少30个历史样本的ETF。请在数据订阅更新后新建分析。')
    await etfActionStep.execute(context)
    await context.updateProgress(1, 1, quality.status === 'limited' ? '覆盖度不足80%，仅允许有限证据分析' : '质量校验通过；保留缺失数据提示')
  }
}
