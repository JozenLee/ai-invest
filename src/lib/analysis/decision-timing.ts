import type { CalendarDay } from '@/lib/research/contracts'
import { chinaDate, currentSessionQuoteCutoff, sessionBoundary } from '@/lib/research/time'

export type DecisionTimingStatus = 'execution-ready' | 'reference-only'
export type MarketSessionPhase = 'trading' | 'non-trading'
export type DecisionTimingLabel = '交易时段 · 实时数据' | '非交易时段 · 最新收盘数据' | '仅供投资参考'

export type DecisionTimingAssessment = {
  version: 1
  status: DecisionTimingStatus
  executionReady: boolean
  label: DecisionTimingLabel
  phase: MarketSessionPhase
  timezone: 'Asia/Shanghai'
  asOf: string
  generatedAt?: string
  checkedAt?: string
  calendarVerified?: boolean
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
    lunchSnapshotEarliest: '11:25'
    maxEventCheckAgeSeconds: 1200
  }
  reasons: string[]
  basis: string
}

export type QuoteObservation = { code: string; tradeDate: string | null; fetchedAt: string | null }
export type EventCheckObservation = { key: string; lastSuccessAt: string | null }

const policy = {
  morningSession: '09:30–11:30', afternoonSession: '13:00–15:00', maxQuoteAgeSeconds: 300, lunchSnapshotEarliest:'11:25', maxEventCheckAgeSeconds: 1200,
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
  // During lunch the latest morning snapshot is still today's actionable market
  // evidence. It must pass the same current-session freshness gate instead of
  // silently becoming a previous-close report.
  return minutes >= 9 * 60 + 30 && minutes < 15 * 60 ? 'trading' : 'non-trading'
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
    const observed=Date.parse(quote?.fetchedAt||'')
    return quote?.tradeDate === tradingDate && lag !== null && observed>=currentSessionQuoteCutoff(input.asOf).getTime() ? lag : null
  })
  const eventChecks = input.eventChecks || []
  const eventLags = eventChecks.map(check => {
    const lag = lagSeconds(input.asOf, check.lastSuccessAt)
    return lag !== null && lag <= policy.maxEventCheckAgeSeconds ? lag : null
  })
  // The subscription layer owns freshness. During continuous trading the label
  // may claim realtime data only when every selected ETF has a same-session
  // quote inside the five-minute window. The report can still be generated when
  // this audit fails, but it must remain reference-only.
  const eventChecksReady = eventChecks.length === 0 || eventLags.every(lag=>lag!==null)
  const executionReady = boundary.verified && calendarDay !== undefined && eventChecksReady && (phase !== 'trading'||(uniqueTickers.length>0&&quoteLags.every(lag=>lag!==null)))
  const freshQuoteTimes = uniqueTickers.map(code => quoteByCode.get(code)?.fetchedAt || null).filter((value): value is string => !!value).sort()
  const freshEventTimes = eventChecks.map(check => check.lastSuccessAt).filter((value): value is string => !!value).sort()
  return {
    version: 1,
    calendarVerified: boundary.verified && calendarDay !== undefined,
    status: executionReady?'execution-ready':'reference-only',
    executionReady,
    label: executionReady?(phase === 'trading' ? '交易时段 · 实时数据' : '非交易时段 · 最新收盘数据'):'仅供投资参考',
    phase,
    timezone: 'Asia/Shanghai',
    asOf: input.asOf,
    checkedAt: input.asOf,
    tradingDate,
    closeDataSession: boundary.expectedSession,
    eventCutoff: input.asOf,
    quoteAsOf: freshQuoteTimes[0] || null,
    eventCheckAsOf: freshEventTimes[0] || null,
    validUntil: (() => {
      if (phase === 'trading') {
        const oldest = freshQuoteTimes[0]
        if (!oldest) return input.asOf
        const minutes = chinaMinutes(input.asOf)
        return minutes >= 11 * 60 + 30 && minutes < 13 * 60
          ? new Date(`${tradingDate}T13:00:00+08:00`).toISOString()
          : new Date(Math.min(Date.parse(oldest) + policy.maxQuoteAgeSeconds * 1000, Date.parse(`${tradingDate}T15:00:00+08:00`))).toISOString()
      }
      const next = input.calendar.filter(day => day.open && Date.parse(`${day.date}T09:30:00+08:00`) > Date.parse(input.asOf)).sort((a,b) => a.date.localeCompare(b.date))[0]
      return next ? new Date(`${next.date}T09:30:00+08:00`).toISOString() : input.asOf
    })(),
    quoteCoverage: { fresh: quoteLags.filter(lag => lag !== null).length, total: uniqueTickers.length, maxLagSeconds: quoteLags.every(lag => lag === null) ? null : Math.max(...quoteLags.filter((lag): lag is number => lag !== null)) },
    eventCheckCoverage: { fresh: eventLags.filter(lag => lag !== null).length, total: eventChecks.length, maxLagSeconds: eventLags.every(lag => lag === null) ? null : Math.max(...eventLags.filter((lag): lag is number => lag !== null)) },
    policy,
    reasons: executionReady?[]:[...(!boundary.verified || !calendarDay ? ['交易日历未核验，报告仅保留研究参考价值'] : []),...(!eventChecksReady?['材料性事件检查未全部达到20分钟时效，操作前需补齐事件复核']:[]),...(phase==='trading'&&!quoteLags.every(lag=>lag!==null)?['交易时段实时行情未全部达到5分钟时效，报告仅保留研究参考价值']:[])],
    basis: phase === 'trading'&&executionReady
      ? '行情由底层订阅提供实时快照；分析流程与其他时段一致。净值、持仓、财报等低频字段保留各自披露日期。'
      : phase==='trading'
        ? '交易时段实时行情覆盖不足；报告使用最近完整收盘数据并保留时效缺口。'
        : '行情由底层订阅提供最新交易日收盘数据；分析流程与交易时段一致。净值、持仓、财报等低频字段保留各自披露日期。',
  }
}

export function effectiveDecisionTiming(value: DecisionTimingAssessment | null | undefined, _now = new Date().toISOString(), legacy?: { asOf?: string | null; closeDataSession?: string | null }): DecisionTimingAssessment {
  if (!value) {
    const legacyAsOf = legacy?.asOf || _now
    return {
      version: 1, status: 'reference-only', executionReady: false, label: '仅供投资参考', phase: 'non-trading', timezone: 'Asia/Shanghai', asOf: legacyAsOf,
      tradingDate: chinaDate(legacyAsOf), closeDataSession: legacy?.closeDataSession || null, eventCutoff: legacyAsOf, quoteAsOf: null, eventCheckAsOf: null, validUntil: null,
      quoteCoverage: { fresh: 0, total: 0, maxLagSeconds: null }, eventCheckCoverage: { fresh: 0, total: 0, maxLagSeconds: null }, policy,
      reasons: ['旧报告没有交易时段时效审计，仅保留研究参考价值'], basis: '旧报告仅保留研究参考价值。',
    }
  }
  const legacyPhase=String(value.phase)
  const normalizedPhase:MarketSessionPhase=legacyPhase==='trading'||legacyPhase==='decision-window'?'trading':'non-trading'
  const explicitlyReferenceOnly=value.executionReady===false||value.status==='reference-only'||value.label==='仅供投资参考'||value.reasons.some(reason=>reason.includes('图谱端到端验证'))
  // Legacy snapshots without an expiry cannot grant perpetual execution rights.
  const expiry = value.validUntil || (normalizedPhase === 'trading' && value.quoteAsOf
    ? new Date(Date.parse(value.quoteAsOf) + policy.maxQuoteAgeSeconds * 1000).toISOString()
    : value.asOf)
  const expired = !Number.isFinite(Date.parse(expiry)) || Date.parse(_now) >= Date.parse(expiry) || Date.parse(_now) < Date.parse(value.asOf)
  const eventLag=lagSeconds(_now,value.eventCheckAsOf)
  const eventExpired=value.eventCheckCoverage.total>0&&(eventLag===null||eventLag>policy.maxEventCheckAgeSeconds)
  const executionReady=!explicitlyReferenceOnly && !expired && !eventExpired
  const label:DecisionTimingLabel=!executionReady?'仅供投资参考':normalizedPhase==='trading'?'交易时段 · 实时数据':'非交易时段 · 最新收盘数据'
  const reasons=[...new Set([...value.reasons,...(expired?['冻结数据已超过有效期，需基于新快照复核后才能执行']:[]),...(eventExpired?['事件检查已超过20分钟，需补齐事件复核后再操作']:[])])]
  const basis=normalizedPhase==='trading'
    ? '行情由底层订阅提供实时快照；分析流程与其他时段一致。'
    : '行情由底层订阅提供最新交易日收盘数据；分析流程与交易时段一致。'
  return {...value,checkedAt:_now,phase:normalizedPhase,status:executionReady?'execution-ready':'reference-only',executionReady,label,validUntil:value.validUntil || (normalizedPhase==='trading'?expiry:null),reasons,basis:!executionReady?value.basis||basis:basis}
}

export function finalizeDecisionTiming(value: DecisionTimingAssessment, _generatedAt: string) {
  const finalized = effectiveDecisionTiming(value, _generatedAt)
  return { ...finalized, generatedAt:_generatedAt }
}

export function normalizeReportTimingText(value:string|null|undefined,timing:DecisionTimingAssessment){
  if(!value)return null
  return value
    .replace(/交易时段 · 实时数据|非交易时段 · 最新收盘数据/g, timing.label)
    .replace(/交易时段数据待补齐：实时行情已超过5分钟时效，请重新生成报告。\s*/g,`${timing.label}。`)
    .replace(/本报告在交易时间生成，实时数据有效至 [^。]+。/g,`${timing.label}。分析流程不因生成时点变化。`)
}
