import { marketDataProvider } from '@/lib/providers'
import { prisma } from '@/lib/db'
import { calculateAllIndicators, type DailyData } from '@/lib/indicators'
import type { StepDefinition } from '../types'

function enrichMarketData(item: any) {
  const history = Array.isArray(item?.history) ? item.history : []
  const dailyData: DailyData[] = history.map((row: any) => ({ date: String(row.date || ''), open: Number(row.open || row.close || 0), high: Number(row.high || row.close || 0), low: Number(row.low || row.close || 0), close: Number(row.close || row.price || 0), volume: Number(row.volume || 0), amount: Number(row.amount || 0) })).filter((row: DailyData) => row.close > 0)
  if (dailyData.length < 30) return item
  const indicators = calculateAllIndicators(dailyData)
  const closes = dailyData.map((row) => row.close)
  const returns: number[] = closes.slice(1).map((close: number, index: number) => (close - closes[index]) / closes[index]).filter(Number.isFinite)
  const volatility = returns.length ? Math.sqrt(returns.reduce((sum: number, value: number) => sum + value * value, 0) / returns.length) * Math.sqrt(252) * 100 : null
  let peak = closes[0]; let maxDrawdown = 0
  for (const close of closes) { peak = Math.max(peak, close); maxDrawdown = Math.max(maxDrawdown, peak ? (peak - close) / peak * 100 : 0) }
  return { ...item, keyIndicators: indicators, ma5: indicators.trend.ma.ma5, ma10: indicators.trend.ma.ma10, ma20: indicators.trend.ma.ma20, ma60: indicators.trend.ma.ma60, macd: indicators.trend.macd, boll: indicators.trend.boll, dmi: indicators.trend.dmi, rsi: indicators.momentum.rsi.rsi12, kdj: indicators.momentum.kdj, cci: indicators.momentum.cci, wr: indicators.momentum.wr, obv: indicators.volume.obv, volatility, max_drawdown: maxDrawdown, data_points: dailyData.length }
}

/**
 * 步骤2: 获取ETF市场数据
 */
export const fetchETFDataStep: StepDefinition = {
  name: 'fetch-etf-data',
  description: '获取ETF市场数据',
  dependencies: ['fetch-etfs'],
  estimatedDuration: 10000,

  async execute(context) {
    const etfCodes = context.artifacts.get('etf-codes') as string

    if (!etfCodes || etfCodes.trim() === '') {
      await context.updateProgress(1, 1, '无ETF数据需要获取')
      await context.saveArtifact('etf-market-data', [], 'DATA')
      return
    }

    const codes = etfCodes.split(',').filter(Boolean)
    await context.updateProgress(0, codes.length, '开始获取ETF市场数据...')

    const localRows = await prisma.eTFDaily.findMany({
      where: { ticker: { in: codes } },
      orderBy: { date: 'asc' },
    })
    const localByCode = new Map<string, typeof localRows>()
    for (const row of localRows) {
      const rows = localByCode.get(row.ticker) || []
      rows.push(row)
      localByCode.set(row.ticker, rows)
    }
    const localResults = codes.map((code) => {
      const rows = localByCode.get(code) || []
      if (rows.length === 0) return null
      const latest = rows.at(-1)!
      return {
        success: true,
        data: {
          ticker: code,
          name: latest.name,
          price: latest.close,
          changePct: 0,
          history: rows.map((row) => ({
            date: row.date.toISOString().slice(0, 10),
            open: row.open,
            high: row.high,
            low: row.low,
            close: row.close,
            volume: Number(row.volume),
            amount: row.amount || 0,
          })),
        },
      }
    })
    const missingCodes = codes.filter((code, index) => !localResults[index] || (localResults[index]?.data.history.length || 0) < 30)
    if (missingCodes.length === 0) {
      await context.updateProgress(codes.length, codes.length, `已读取本地数据库中的 ${codes.length} 个ETF数据`)
      await context.saveArtifact('etf-market-data', localResults.map((result) => enrichMarketData(result!.data)), 'DATA')
      return
    }

    // 使用 ResilientProvider 批量获取ETF数据
    const etfDataList = await marketDataProvider.fetchBatch<any>(
      missingCodes.map((code) => ({
        // FastAPI ETF detail endpoint returns the latest quote plus history.
        path: `/api/etf/${code}`,
        cacheKey: `etf:${code}:latest`
      })),
      (completed, total) => {
        context.updateProgress(completed, total, `已获取 ${completed}/${total} 个ETF数据`)
      }
    )

    // 保存ETF市场数据
    const remoteByCode = new Map(missingCodes.map((code, index) => [code, etfDataList[index]]))
    await context.saveArtifact('etf-market-data', codes.map((code, index) => {
      const local = localResults[index]
      const remote = remoteByCode.get(code)
      return enrichMarketData(local?.data || remote?.data || remote)
    }).filter(Boolean), 'DATA')
  }
}
