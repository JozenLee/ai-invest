import type { StepDefinition } from '../types'

/**
 * 步骤7: 计算市场趋势指标
 */
export const calculateMarketTrendsStep: StepDefinition = {
  name: 'calculate-market-trends',
  description: '计算市场趋势指标',
  dependencies: ['fetch-etf-data', 'fetch-company-data', 'fetch-market-snapshot'],
  estimatedDuration: 10000,

  async execute(context) {
    await context.updateProgress(0, 3, '开始计算市场趋势...')

    const etfMarketData = (context.artifacts.get('etf-market-data') as any[]) || []
    const companyMarketData = (context.artifacts.get('company-market-data') as any[]) || []
    const marketSnapshot = context.artifacts.get('market-snapshot') || null

    // 计算ETF平均涨跌幅
    const etfChanges = etfMarketData
      .map((etf: any) => etf.changePct ?? etf.change_pct)
      .filter((v: number) => typeof v === 'number' && Number.isFinite(v))

    const etfAvgChange = etfChanges.length > 0
      ? etfChanges.reduce((sum: number, v: number) => sum + v, 0) / etfChanges.length
      : null

    await context.updateProgress(1, 3, 'ETF趋势计算完成')

    // 计算企业平均涨跌幅
    const companyChanges = companyMarketData
      .map((company: any) => company.marketData?.changePct ?? company.marketData?.change_pct)
      .filter((v: number) => typeof v === 'number' && Number.isFinite(v))

    const companyAvgChange = companyChanges.length > 0
      ? companyChanges.reduce((sum: number, v: number) => sum + v, 0) / companyChanges.length
      : null

    await context.updateProgress(2, 3, '企业趋势计算完成')

    // 计算市场热度
    const marketHeat = {
      etf: {
        total: etfMarketData.length,
        rising: etfChanges.filter((v: number) => v > 0).length,
        falling: etfChanges.filter((v: number) => v < 0).length,
        avgChange: etfAvgChange?.toFixed(2) ?? null
      },
      company: {
        total: companyMarketData.length,
        rising: companyChanges.filter((v: number) => v > 0).length,
        falling: companyChanges.filter((v: number) => v < 0).length,
        avgChange: companyAvgChange?.toFixed(2) ?? null
      },
      overall: {
        trend: etfAvgChange === null ? 'unknown' : etfAvgChange > 0 ? 'bullish' : etfAvgChange < 0 ? 'bearish' : 'neutral',
        strength: etfAvgChange === null ? null : Math.abs(etfAvgChange),
        marketSnapshot
      }
    }

    await context.updateProgress(3, 3, '市场趋势计算完成')

    await context.saveArtifact('market-trends', marketHeat, 'DATA')
  }
}
