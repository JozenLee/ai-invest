import type { CalendarDay } from '@/lib/research/contracts'
import { chinaDate, sessionBoundary } from '@/lib/research/time'

export type DecisionTimingStatus = 'execution-ready' | 'reference-only'
export type MarketSessionPhase = 'decision-window' | 'trading' | 'midday-break' | 'pre-market' | 'post-market' | 'non-trading' | 'calendar-unverified'

export type DecisionTimingAssessment = {
  version: 1
  status: DecisionTimingStatus
  executionReady: boolean
  label: '盘中执行时效已通过' | '仅供投资参考'
  phase: MarketSessionPhase
  timezone: 'Asia/Shanghai'
  asOf: string
  generatedAt?: string
  tradingDate: string
  closeDataSession: string | null
  eventCutoff: string
  quoteAsOf: string | null
  eventCheckAsOf: string | null
  validUntil: string | null
  quoteCoverage: { fresh: number; total: number; maxLagSeconds: number | null }
  eventCheckCoverage: { fresh: number; total: number; maxLagSeconds: number | null }
  policy: {
    startTime: '14:20'
    lastStartTime: '14:50'
    expiresAt: '14:55'
    maxQuoteAgeSeconds: 300
    maxEventCheckAgeSeconds: 1200
  }
  reasons: string[]
  basis: string
}

export type QuoteObservation = { code: string; tradeDate: string | null; fetchedAt: string | null }
export type EventCheckObservation = { key: string; lastSuccessAt: string | null }

const policy = {
  startTime: '14:20', lastStartTime: '14:50', expiresAt: '14:55', maxQuoteAgeSeconds: 300, maxEventCheckAgeSeconds: 1200,
} as const

function chinaMinutes(asOf: string) {
  const shifted = new Date(Date.parse(asOf) + 8 * 3600_000)
  return shifted.getUTCHours() * 60 + shifted.getUTCMinutes()
}

function lagSeconds(asOf: string, observedAt: string | null) {
  const lag = (Date.parse(asOf) - Date.parse(observedAt || '')) / 1000
  return Number.isFinite(lag) && lag >= -30 ? Math.max(0, lag) : null
}

function phaseFor(minutes: number, open: boolean | undefined, verified: boolean): MarketSessionPhase {
  if (!verified || open === undefined) return 'calendar-unverified'
  if (!open) return 'non-trading'
  if (minutes >= 14 * 60 + 20 && minutes <= 14 * 60 + 50) return 'decision-window'
  if (minutes < 9 * 60 + 30) return 'pre-market'
  if (minutes >= 11 * 60 + 30 && minutes < 13 * 60) return 'midday-break'
  if (minutes > 15 * 60) return 'post-market'
  return 'trading'
}

export function isNearCloseDecisionWindow(asOf = new Date().toISOString()) {
  const minutes = chinaMinutes(asOf)
  return minutes >= 14 * 60 + 20 && minutes <= 14 * 60 + 50
}

export function assessDecisionTiming(input: {
  asOf: string
  calendar: CalendarDay[]
  expectedTickers: string[]
  quotes: QuoteObservation[]
  eventChecks?: EventCheckObservation[]
}): DecisionTimingAssessment {
  const tradingDate = chinaDate(input.asOf)
  const boundary = sessionBoundary(input.calendar, input.asOf)
  const calendarDay = input.calendar.find(day => day.date === tradingDate)
  const phase = phaseFor(chinaMinutes(input.asOf), calendarDay?.open, boundary.verified)
  const uniqueTickers = [...new Set(input.expectedTickers)]
  const quoteByCode = new Map(input.quotes.map(quote => [quote.code, quote]))
  const quoteLags = uniqueTickers.map(code => {
    const quote = quoteByCode.get(code)
    const lag = lagSeconds(input.asOf, quote?.fetchedAt || null)
    return quote?.tradeDate === tradingDate && lag !== null && lag <= policy.maxQuoteAgeSeconds ? lag : null
  })
  const eventChecks = input.eventChecks || []
  const eventLags = eventChecks.map(check => {
    const lag = lagSeconds(input.asOf, check.lastSuccessAt)
    return lag !== null && lag <= policy.maxEventCheckAgeSeconds ? lag : null
  })
  const quotesFresh = uniqueTickers.length > 0 && quoteLags.every(lag => lag !== null)
  const eventsFresh = eventChecks.length > 0 && eventLags.every(lag => lag !== null)
  const validUntil = phase === 'decision-window' ? new Date(`${tradingDate}T${policy.expiresAt}:00+08:00`).toISOString() : null
  const reasons: string[] = []
  if (phase === 'calendar-unverified') reasons.push('交易日历未通过核验')
  else if (phase === 'non-trading') reasons.push('生成时点不是沪深交易日')
  else if (phase !== 'decision-window') reasons.push('生成时点不在收盘前决策窗口 14:20–14:50')
  if (phase === 'decision-window' && !quotesFresh) reasons.push(`目标ETF实时行情未全部达到5分钟时效（${quoteLags.filter(lag => lag !== null).length}/${uniqueTickers.length}）`)
  if (phase === 'decision-window' && !eventsFresh) reasons.push(`公告检查未全部达到20分钟时效（${eventLags.filter(lag => lag !== null).length}/${eventChecks.length}）`)
  const executionReady = phase === 'decision-window' && quotesFresh && eventsFresh
  const freshQuoteTimes = uniqueTickers.map(code => quoteByCode.get(code)?.fetchedAt || null).filter((value): value is string => !!value).sort()
  const freshEventTimes = eventChecks.map(check => check.lastSuccessAt).filter((value): value is string => !!value).sort()
  return {
    version: 1,
    status: executionReady ? 'execution-ready' : 'reference-only',
    executionReady,
    label: executionReady ? '盘中执行时效已通过' : '仅供投资参考',
    phase,
    timezone: 'Asia/Shanghai',
    asOf: input.asOf,
    tradingDate,
    closeDataSession: boundary.expectedSession,
    eventCutoff: input.asOf,
    quoteAsOf: freshQuoteTimes[0] || null,
    eventCheckAsOf: freshEventTimes[0] || null,
    validUntil,
    quoteCoverage: { fresh: quoteLags.filter(lag => lag !== null).length, total: uniqueTickers.length, maxLagSeconds: quoteLags.every(lag => lag === null) ? null : Math.max(...quoteLags.filter((lag): lag is number => lag !== null)) },
    eventCheckCoverage: { fresh: eventLags.filter(lag => lag !== null).length, total: eventChecks.length, maxLagSeconds: eventLags.every(lag => lag === null) ? null : Math.max(...eventLags.filter((lag): lag is number => lag !== null)) },
    policy,
    reasons,
    basis: '趋势与技术指标使用最近完整收盘日；盘中实时行情只用于当前价格与时效复核；事件仅纳入冻结截点前可见内容。',
  }
}

export function effectiveDecisionTiming(value: DecisionTimingAssessment | null | undefined, now = new Date().toISOString(), legacy?: { asOf?: string | null; closeDataSession?: string | null }): DecisionTimingAssessment {
  if (!value) {
    const legacyAsOf = legacy?.asOf || now
    return {
      version: 1, status: 'reference-only', executionReady: false, label: '仅供投资参考', phase: 'calendar-unverified', timezone: 'Asia/Shanghai', asOf: legacyAsOf,
      tradingDate: chinaDate(legacyAsOf), closeDataSession: legacy?.closeDataSession || null, eventCutoff: legacyAsOf, quoteAsOf: null, eventCheckAsOf: null, validUntil: null,
      quoteCoverage: { fresh: 0, total: 0, maxLagSeconds: null }, eventCheckCoverage: { fresh: 0, total: 0, maxLagSeconds: null }, policy,
      reasons: ['旧报告没有盘中时效审计，不能作为当前交易指令'], basis: '旧报告仅保留研究参考价值。',
    }
  }
  if (!value.executionReady) return value
  if (!value.validUntil || Date.parse(now) > Date.parse(value.validUntil)) {
    return { ...value, status: 'reference-only', executionReady: false, label: '仅供投资参考', reasons: [...new Set([...value.reasons, `执行有效期已于 ${value.validUntil || '未标注'} 结束`])] }
  }
  return value
}

export function finalizeDecisionTiming(value: DecisionTimingAssessment, generatedAt: string) {
  const finalized = effectiveDecisionTiming(value, generatedAt)
  return { ...finalized, generatedAt }
}
