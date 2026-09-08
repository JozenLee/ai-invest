import { chinaDate, dateKey } from './time'

/** The book follows the live session; daily indicators keep their own close date. */
export function selectResearchOrderbook<T extends Record<string, unknown>>(
  rows: T[], ticker: string, asOf: string, closeDate: string, trading: boolean,
): T | undefined {
  const expectedDate = trading ? chinaDate(asOf) : closeDate
  return rows.filter(row => {
    const stamp = Date.parse(String(row.publishedAt || ''))
    const lag = Date.parse(asOf) - stamp
    const bid = Number(row.bid), ask = Number(row.ask)
    return String(row.code) === ticker && dateKey(row.date) === expectedDate &&
      Number.isFinite(stamp) && chinaDate(new Date(stamp).toISOString()) === expectedDate &&
      lag >= 0 && (!trading || lag <= 300_000) &&
      Number.isFinite(bid) && Number.isFinite(ask) && bid > 0 && ask >= bid
  }).sort((a, b) => Date.parse(String(b.publishedAt)) - Date.parse(String(a.publishedAt)))[0]
}
