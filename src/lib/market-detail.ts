import { calculateAllIndicators, type DailyData, type IndicatorResult } from '@/lib/indicators'

export type DetailMetrics = { dataPoints: number; latestChangePct: number | null; periodChangePct: number | null; volatility: number | null; maxDrawdown: number | null; indicators: IndicatorResult | null; qualityWarning?: string; discontinuities?: Array<{ date: string; changePct: number }> }

export function priceDiscontinuities(data: Array<{ date: string; close: number }>) {
  return data.slice(1).flatMap((row, index) => {
    const changePct = (row.close / data[index].close - 1) * 100
    return Number.isFinite(changePct) && Math.abs(changePct) > 30 ? [{ date: row.date, changePct }] : []
  })
}

export function toDailyData(rows: Array<Record<string, unknown>>): DailyData[] {
  const byDate = new Map<string, DailyData>()
  for (const row of rows) {
    const date = row.date instanceof Date ? row.date.toISOString().slice(0, 10) : String(row.date || '').slice(0, 10)
    const item = { date, open: Number(row.open || 0), high: Number(row.high || 0), low: Number(row.low || 0), close: Number(row.close || 0), volume: Number(row.volume || 0), amount: Number(row.amount || 0) }
    if (/^\d{4}-\d{2}-\d{2}$/.test(item.date) && Number.isFinite(Date.parse(item.date)) && Date.parse(item.date) <= Date.now() &&
      [item.open, item.high, item.low, item.close].every((value) => Number.isFinite(value) && value > 0) &&
      item.high >= Math.max(item.open, item.close) && item.low <= Math.min(item.open, item.close) &&
      [item.volume, item.amount].every(value => Number.isFinite(value) && value >= 0)) byDate.set(item.date, item)
  }
  return [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date))
}

export function mergeQuote(history: DailyData[], quote: Record<string, unknown> | null) {
  if (!quote || !Number.isFinite(Number(quote.price)) || Number(quote.price) <= 0) return history
  // Tushare rt_k: shares/CNY; persisted daily bars: lots/thousand CNY.
  // Preserve raw quote units; normalize only the derived indicator series.
  const volume = quote.volume == null ? null : Number(quote.volume) / (quote.source === 'tushare_rt_k' ? 100 : 1)
  const amount = quote.amount == null ? null : Number(quote.amount) / (quote.source === 'tushare_rt_k' ? 1000 : 1)
  const tradeDate = String(quote.tradeDate || '').slice(0, 10)
  const index = history.findIndex((row) => row.date === tradeDate)
  const open = Number(quote.open || 0), high = Number(quote.high || 0), low = Number(quote.low || 0), price = Number(quote.price)
  if (index >= 0) {
    history[index] = { ...history[index], open: open > 0 ? open : history[index].open, high: high > 0 ? Math.max(high, price) : Math.max(history[index].high, price), low: low > 0 ? Math.min(low, price) : Math.min(history[index].low, price), close: price, volume: volume ?? history[index].volume, amount: amount ?? history[index].amount }
  } else if (tradeDate && [open, high, low, price].every((value) => Number.isFinite(value) && value > 0)) {
    history.push({ date: tradeDate, open, high, low, close: price, volume: volume ?? 0, amount: amount ?? 0 })
    history.sort((a, b) => a.date.localeCompare(b.date))
  }
  return history
}

export function calculateDetailMetrics(data: DailyData[], quote?: Record<string, unknown> | null): DetailMetrics {
  if (!data.length) return { dataPoints: 0, latestChangePct: null, periodChangePct: null, volatility: null, maxDrawdown: null, indicators: null }
  const latest = data[data.length - 1], previous = data[data.length - 2], first = data[0]
  const quoteChange = quote?.changePct == null ? NaN : Number(quote.changePct)
  const latestChangePct = Number.isFinite(quoteChange) ? quoteChange : previous?.close ? ((latest.close - previous.close) / previous.close) * 100 : null
  const discontinuities = priceDiscontinuities(data)
  if (discontinuities.length) return { dataPoints: data.length, latestChangePct: discontinuities.some(row => row.date === latest.date) && !Number.isFinite(quoteChange) ? null : latestChangePct, periodChangePct: null, volatility: null, maxDrawdown: null, indicators: null, discontinuities, qualityWarning: '原始价格序列存在单日超过30%的不连续变动；拆分、复权或数据异常原因未核验，停用跨断点技术指标、区间收益、波动率与回撤。' }
  const periodChangePct = first.close ? ((latest.close - first.close) / first.close) * 100 : null
  const returns = data.slice(1).map((item, index) => (item.close - data[index].close) / data[index].close)
  const mean = returns.length ? returns.reduce((sum, value) => sum + value, 0) / returns.length : 0
  const variance = returns.length > 1 ? returns.reduce((sum, value) => sum + (value - mean) ** 2, 0) / (returns.length - 1) : 0
  let peak = data[0].close, maxDrawdown = 0
  for (const item of data) { peak = Math.max(peak, item.close); maxDrawdown = Math.max(maxDrawdown, peak ? ((peak - item.close) / peak) * 100 : 0) }
  return { dataPoints: data.length, latestChangePct, periodChangePct, volatility: returns.length > 1 ? Math.sqrt(variance) * Math.sqrt(252) * 100 : null, maxDrawdown, indicators: calculateAllIndicators(data) }
}

export function marketDetail(rows: Array<Record<string, unknown>>, quote: Record<string, unknown> | null, limit: number, now = Date.now()) {
  const bars = toDailyData(rows)
  const quoteDate = String(quote?.tradeDate || '')
  const local = new Date(now + 8 * 3600000)
  const today=local.toISOString().slice(0,10), dailyDate=bars.at(-1)?.date
  const completedCandleWins=dailyDate===quoteDate&&(dailyDate<today||local.getUTCHours()>=15)
  const effectiveQuote = quote && !completedCandleWins && Number.isFinite(Date.parse(quoteDate)) && Date.parse(quoteDate) <= now && quoteDate >= (dailyDate || '') ? quote : null
  const history = mergeQuote(bars, effectiveQuote).slice(-limit)
  return { history, quote: effectiveQuote, metrics: calculateDetailMetrics(history, effectiveQuote), historyPointTarget: limit, historyComplete: history.length === limit }
}

const METRIC_ALIASES: Array<[string, string[]]> = [
  ['营业收入', ['营业收入', 'total_revenue', 'revenue', 'Total Revenue', '营业额']], ['净利润', ['净利润', 'n_income', 'net_income', 'Net Income', '股东应占溢利', '除税后溢利']],
  ['毛利率', ['毛利率', 'grossprofit_margin']], ['净利率', ['净利率', 'netprofit_margin']], ['ROE', ['roe', 'ROE']],
  ['经营现金流', ['经营现金流', 'n_cashflow_act', 'Operating Cash Flow', '经营业务现金净额', '经营活动产生的现金流量净额']], ['总资产', ['total_assets', 'Total Assets', '总资产', '资产总额']],
  ['总负债', ['total_liab', 'Total Liabilities Net Minority Interest', '总负债', '负债总额']], ['股东权益', ['total_hldr_eqy_exc_min_int', 'Stockholders Equity', '股东权益', '总权益']],
  ['每股收益', ['basic_eps', 'diluted_eps', 'Basic EPS', '每股基本盈利']], ['营收同比', ['q_sales_yoy', 'tr_yoy']], ['净利润同比', ['q_netprofit_yoy', 'netprofit_yoy']],
]

export function financialView(row: { reportPeriod: string; reportType: string; publishDate: Date | null; source: string | null; metricsJson: string }) {
  // Older Python payloads contain bare NaN/Infinity. Preserve quoted text,
  // replacing only non-JSON numeric tokens so one old report cannot break details.
  const sanitized = (row.metricsJson || '{}').replace(/"(?:\\.|[^"\\])*"|\bNaN\b|-?Infinity/g, (token) => token.startsWith('"') ? token : 'null')
  let raw: Record<string, unknown> = {}, warning: string | null = null
  try { const parsed = JSON.parse(sanitized); if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('invalid report'); raw = parsed as Record<string, unknown> } catch { warning = '原始财报结构异常，部分字段不可读' }
  const metrics = METRIC_ALIASES.flatMap(([label, aliases]) => {
    const value = aliases.map((key) => raw[key]).find((item) => item !== undefined && item !== null && item !== '')
    return value === undefined || !Number.isFinite(Number(value)) ? [] : [{ label, value: Number(value) }]
  })
  const rawMetrics = Object.entries(raw).filter(([key, value]) => typeof value === 'number' && Number.isFinite(value) && !['update_flag'].includes(key)).map(([label, value]) => ({ label, value }))
  const period = row.reportPeriod.replace(/^(\d{4})(\d{2})(\d{2})$/, '$1-$2-$3')
  return { period, reportType: row.reportType, publishDate: row.publishDate, source: row.source, currency: raw.currency || '来源未标注', metrics: metrics.length ? metrics : rawMetrics.slice(0, 8), rawMetrics, warning }
}

export function announcementView(row: { title: string; eventType: string | null; publishDate: Date | null; url: string | null; content: string | null; source: string | null }) {
  const content = String(row.content || '').replace(/\s+/g, ' ').trim()
  const summary = content ? `${content.slice(0, 220)}${content.length > 220 ? '…' : ''}` : '上游未提供正文概览，请通过原文链接查看完整内容。'
  return { title: row.title, eventType: row.eventType, publishDate: row.publishDate, url: row.url, summary, source: row.source }
}
