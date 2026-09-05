import type { CalendarDay } from './contracts'
export function dateKey(value: unknown): string | null {
  const text = value instanceof Date ? value.toISOString().slice(0, 10) : String(value || '').slice(0, 10).replace(/^(\d{4})(\d{2})(\d{2})$/, '$1-$2-$3')
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) return null
  const time = Date.parse(text)
  return Number.isFinite(time) && new Date(time).toISOString().slice(0, 10) === text ? text : null
}
export function chinaDate(asOf: string) { return new Date(Date.parse(asOf) + 8 * 3600000).toISOString().slice(0, 10) }
export function visibleAt(published: string | null | undefined, fetched: string | null | undefined, asOf: string) {
  const cutoff = Date.parse(asOf), pub = Date.parse(published || ''), fetch = Date.parse(fetched || '')
  return Number.isFinite(pub) && Number.isFinite(fetch) && pub <= cutoff && fetch <= cutoff
}
export function sessionBoundary(calendar: CalendarDay[], asOf: string) {
  const today = chinaDate(asOf)
  const localHour = new Date(Date.parse(asOf) + 8 * 3600000).getUTCHours()
  const end = localHour >= 15 ? today : new Date(Date.parse(today) - 86400000).toISOString().slice(0, 10)
  const days = new Map(calendar.filter(row => dateKey(row.date)).map(row => [row.date, row.open]))
  // Require explicit closed days too. Weekdays are not an exchange calendar.
  for (let offset = 0; offset < 40; offset++) {
    const day = new Date(Date.parse(end) - offset * 86400000).toISOString().slice(0, 10)
    if (!days.has(day)) return { expectedSession: null, verified: false }
    if (days.get(day)) return { expectedSession: day, verified: true }
  }
  return { expectedSession: null, verified: false }
}
export function nextReview(calendar: CalendarDay[], asOf: string) {
  const today=chinaDate(asOf),close=Date.parse(`${today}T15:00:00+08:00`)
  // A pre-market review is valid through that session. A post-close review
  // expires before the next opening and must be renewed by the morning job.
  if(calendar.some(day=>day.date===today&&day.open)&&Date.parse(asOf)<close) return new Date(close).toISOString()
  const next = calendar.filter(row => row.open && Date.parse(`${row.date}T09:00:00+08:00`) > Date.parse(asOf)).sort((a,b) => a.date.localeCompare(b.date))[0]
  // No future calendar: expire immediately; never silently extend validity.
  return next ? new Date(`${next.date}T09:00:00+08:00`).toISOString() : asOf
}
