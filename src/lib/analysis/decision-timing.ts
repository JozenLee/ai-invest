import type { CalendarDay } from '@/lib/research/contracts'
import { chinaDate, sessionBoundary } from '@/lib/research/time'

export type DecisionTimingStatus = 'execution-ready' | 'reference-only'
export type MarketSessionPhase = 'trading' | 'non-trading'

export type DecisionTimingAssessment = {
  version: 1
  status: DecisionTimingStatus
  executionReady: boolean
  label: '交易时段时效已通过' | '非交易时段投资参考' | '交易时段数据待补齐' | '仅供投资参考'
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
    morningSession: '09:30–11:30'
    afternoonSession: '13:00–15:00'
    maxQuoteAgeSeconds: 300
    maxEventCheckAgeSeconds: 1200
  }
  reasons: string[]
  basis: string
}

export type QuoteObservation = { code: string; tradeDate: string | null; fetchedAt: string | null }
export type EventCheckObservation = { key: string; lastSuccessAt: string | null }

const policy = {
  morningSession: '09:30–11:30', afternoonSession: '13:00–15:00', maxQuoteAgeSeconds: 300, maxEventCheckAgeSeconds: 1200,
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
  if (!verified || open !== true) return 'non-trading'
  const morning = minutes >= 9 * 60 + 30 && minutes < 11 * 60 + 30
  const afternoon = minutes >= 13 * 60 && minutes < 15 * 60
  return morning || afternoon ? 'trading' : 'non-trading'
}

/** Whether the clock is inside either continuous A-share trading session. */
export function isTradingSessionTime(asOf = new Date().toISOString()) {
  const minutes = chinaMinutes(asOf)
  return (minutes >= 9 * 60 + 30 && minutes < 11 * 60 + 30) || (minutes >= 13 * 60 && minutes < 15 * 60)
}
function tradingValidity(asOf: string, tradingDate: string) {
  const minutes = chinaMinutes(asOf)
  const sessionEnd = minutes < 11 * 60 + 30 ? '11:30' : '15:00'
  const freshnessEnd = Date.parse(asOf) + policy.maxQuoteAgeSeconds * 1000
  return new Date(Math.min(freshnessEnd, Date.parse(`${tradingDate}T${sessionEnd}:00+08:00`))).toISOString()
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
  const observationExpiries = [
    ...uniqueTickers.map(code => Date.parse(quoteByCode.get(code)?.fetchedAt || '') + policy.maxQuoteAgeSeconds * 1000),
    ...eventChecks.map(check => Date.parse(check.lastSuccessAt || '') + policy.maxEventCheckAgeSeconds * 1000),
  ].filter(Number.isFinite)
  const validUntil = phase === 'trading' ? new Date(Math.min(Date.parse(tradingValidity(input.asOf, tradingDate)), ...observationExpiries)).toISOString() : null
  const reasons: string[] = []
  if (phase === 'non-trading') reasons.push(boundary.verified && calendarDay?.open ? '当前不在沪深连续交易时段' : '当前为非交易时间')
  if (phase === 'trading' && !quotesFresh) reasons.push(`目标指数基金实时行情未全部达到5分钟时效（${quoteLags.filter(lag => lag !== null).length}/${uniqueTickers.length}）`)
  if (phase === 'trading' && !eventsFresh) reasons.push(`公告检查未全部达到20分钟时效（${eventLags.filter(lag => lag !== null).length}/${eventChecks.length}）`)
  const executionReady = phase === 'trading' && quotesFresh && eventsFresh
  const freshQuoteTimes = uniqueTickers.map(code => quoteByCode.get(code)?.fetchedAt || null).filter((value): value is string => !!value).sort()
  const freshEventTimes = eventChecks.map(check => check.lastSuccessAt).filter((value): value is string => !!value).sort()
  return {
    version: 1,
    status: executionReady ? 'execution-ready' : 'reference-only',
    executionReady,
    label: executionReady ? '交易时段时效已通过' : phase === 'trading' ? '交易时段数据待补齐' : '非交易时段投资参考',
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
    basis: '报告只区分交易时间与非交易时间；趋势和技术指标始终使用最近完整收盘日，交易时段内再追加实时行情与公告时效复核。',
  }
}

export function effectiveDecisionTiming(value: DecisionTimingAssessment | null | undefined, now = new Date().toISOString(), legacy?: { asOf?: string | null; closeDataSession?: string | null }): DecisionTimingAssessment {
  if (!value) {
    const legacyAsOf = legacy?.asOf || now
    return {
      version: 1, status: 'reference-only', executionReady: false, label: '非交易时段投资参考', phase: 'non-trading', timezone: 'Asia/Shanghai', asOf: legacyAsOf,
      tradingDate: chinaDate(legacyAsOf), closeDataSession: legacy?.closeDataSession || null, eventCutoff: legacyAsOf, quoteAsOf: null, eventCheckAsOf: null, validUntil: null,
      quoteCoverage: { fresh: 0, total: 0, maxLagSeconds: null }, eventCheckCoverage: { fresh: 0, total: 0, maxLagSeconds: null }, policy,
      reasons: ['旧报告没有交易时段时效审计，仅保留研究参考价值'], basis: '旧报告仅保留研究参考价值。',
    }
  }
  const legacyPhase=String(value.phase)
  const normalizedPhase:MarketSessionPhase=legacyPhase==='trading'||legacyPhase==='decision-window'?'trading':'non-trading'
  const legacyWindowReason=value.reasons.some(reason=>reason.includes('收盘前决策窗口'))
  value={...value,phase:normalizedPhase,label:value.executionReady?'交易时段时效已通过':normalizedPhase==='trading'?'交易时段数据待补齐':'非交易时段投资参考',reasons:legacyWindowReason?['当前不在沪深连续交易时段']:value.reasons,basis:'报告只区分交易时间与非交易时间；趋势和技术指标使用最近完整收盘日，交易时段内追加实时时效复核。'}
  if (!value.executionReady) return value
  if (!value.validUntil || Date.parse(now) > Date.parse(value.validUntil)) {
    return { ...value, status: 'reference-only', executionReady: false, label: '交易时段数据待补齐', reasons: [...new Set([...value.reasons, '实时行情已超过5分钟时效，请重新生成报告'])] }
  }
  return value
}

export function finalizeDecisionTiming(value: DecisionTimingAssessment, generatedAt: string) {
  const finalized = effectiveDecisionTiming(value, generatedAt)
  return { ...finalized, generatedAt }
}
