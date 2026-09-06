import { prisma } from '@/lib/db'
import type { StepDefinition } from '../types'

/**
 * 步骤6: 获取ETF持仓明细
 */
export const fetchETFHoldingsStep: StepDefinition = {
  name: 'fetch-etf-holdings',
  description: '获取ETF持仓明细',
  dependencies: ['fetch-etf-data'],
  estimatedDuration: 15000,

  async execute(context) {
    const etfCodes = context.artifacts.get('etf-codes') as string

    if (!etfCodes || etfCodes.trim() === '') {
      await context.updateProgress(1, 1, '无ETF持仓需要获取')
      await context.saveArtifact('etf-holdings', [], 'DATA')
      await context.saveArtifact('holdings-summary', { totalETFs: 0, totalHoldings: 0, topStocks: [] }, 'DATA')
      return
    }

    const codes = etfCodes.split(',').filter(Boolean)
    await context.updateProgress(0, codes.length, '开始获取ETF持仓明细...')

    const allHoldings: any[] = []
    const stockWeights: Map<string, number> = new Map()

    for (let i = 0; i < codes.length; i++) {
      const code = codes[i]

      try {
        const localHoldings = await prisma.eTFHolding.findMany({ where: { etfCode: code }, orderBy: { weight: 'desc' }, take: 10 })
        const holdings = localHoldings.length > 0
          ? { success: true, data: localHoldings.map((row) => ({ stock_code: row.stockCode, stock_name: row.stockName, weight: row.weight, shares: row.shares ? Number(row.shares) : null, market_value: row.marketValue, source: 'local-database', trade_date: row.updateDate.toISOString().slice(0, 10) })) }
          : { success: false, data: [] }

        const holdingsPayload = holdings as any
        const rows = Array.isArray(holdingsPayload) ? holdingsPayload : holdingsPayload?.data
        if (Array.isArray(rows)) {
          allHoldings.push(...rows.map((h: any) => ({ ...h, etfCode: code })))

          // 累计股票权重
          rows.forEach((h: any) => {
            const stockCode = h.stock_code || h.code
            const weight = h.weight || 0
            stockWeights.set(stockCode, (stockWeights.get(stockCode) || 0) + weight)
          })
        }
      } catch (error) {
        console.warn(`Failed to fetch holdings for ETF ${code}:`, error)
      }

      await context.updateProgress(
        i + 1,
        codes.length,
        `已获取 ${i + 1}/${codes.length} 个ETF持仓`
      )
    }

    // 找出权重最高的股票
    const topStocks = Array.from(stockWeights.entries())
      .map(([code, weight]) => ({ stockCode: code, totalWeight: weight }))
      .sort((a, b) => b.totalWeight - a.totalWeight)
      .slice(0, 20)

    const summary = {
      totalETFs: codes.length,
      totalHoldings: allHoldings.length,
      uniqueStocks: stockWeights.size,
      topStocks
    }

    await context.saveArtifact('etf-holdings', allHoldings, 'DATA')
    await context.saveArtifact('holdings-summary', summary, 'DATA')

    if (context.input.companySource === 'etf') {
      const companies = Array.from(stockWeights.keys()).map((stockCode) => ({
        stockCode,
        stockName: stockCode,
        source: 'etf-holdings',
        relevance: 1
      }))
      await context.saveArtifact('companies', companies, 'DATA')
      await context.saveArtifact('company-codes', companies.map((company) => company.stockCode).join(','), 'DATA')
    }
  }
}
