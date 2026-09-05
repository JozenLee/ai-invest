import { prisma } from '@/lib/db'
import { freshEvidence } from '@/lib/analysis/evidence'
import { marketDetail } from '@/lib/market-detail'
import { getSubscriptionConfig } from '@/lib/subscription-config-store'
import type { StepDefinition } from '../types'
export const fetchETFDataStep: StepDefinition = {
  name: 'fetch-etf-data', description: '读取ETF订阅快照并计算指标', dependencies: ['fetch-etfs'], estimatedDuration: 1000,
  async execute(context) {
    const codes = [...new Set(String(context.artifacts.get('etf-codes') || '').split(',').filter(Boolean))]
    const config = await getSubscriptionConfig()
    const bindings = (context.artifacts.get('etf-bindings') || []) as Array<{etf_code:string;etf_name:string}>
    const results = await Promise.all(codes.map(async (code) => {
      const [rows, quote] = await Promise.all([
        prisma.eTFDaily.findMany({ where: { ticker: code }, orderBy: { date: 'desc' }, take: config.historyPoints }),
        prisma.marketQuote.findUnique({ where: { instrumentType_code: { instrumentType: 'ETF', code } } }),
      ])
      const detail = marketDetail(rows, quote, config.historyPoints)
      if (detail.history.length < 30 || !freshEvidence(detail.history.at(-1)?.date)) return null
      const latest = detail.history.at(-1)!
      return { ticker: code, name: bindings.find(row => row.etf_code === code)?.etf_name || rows[0]?.name || code, price: latest.close, changePct: detail.metrics.latestChangePct,
        history: detail.history, keyIndicators: detail.metrics.indicators, volatility: detail.metrics.volatility,
        max_drawdown: detail.metrics.maxDrawdown, data_points: detail.history.length,
        source: 'subscription-database', quoteSource: detail.quote?.source || null,
        fetchedAt: detail.quote?.fetchedAt || null, dataDate: latest.date,
        quality: detail.metrics.qualityWarning ? 'unverified-adjustment' : detail.history.length < 60 ? 'insufficient-history' : 'available', qualityWarning: detail.metrics.qualityWarning, discontinuities: detail.metrics.discontinuities }
    }))
    const missing = codes.filter((_, index) => !results[index])
    await context.saveArtifact('etf-market-data', results.filter(Boolean), 'DATA')
    await context.saveArtifact('etf-data-gaps', { missingCodes: missing, requested: codes.length, available: codes.length - missing.length }, 'DATA')
    await context.updateProgress(1, 1, '订阅行情读取完成；缺失 ' + missing.length + ' 个')
  }
}
