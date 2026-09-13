import type { Evaluation, ResearchSnapshot } from '@/lib/research/contracts'
import { auditResearchConsistency } from './research-consistency'

/** Values keep their source unit. Percent is not interchangeable with percentage points. */
export type FactUnit = 'ratio' | 'percent' | 'percentage-point' | 'CNY' | 'CNY-100m' | 'count'
export type FactValue = number | [number, number]
export type ResearchFact = {
  id: string; metric: string; subject: string; period: string; unit: FactUnit; value: FactValue
  scope: string[]; evidenceIds: string[]; label?: string
  basis?: 'actual' | 'consensus'; availableAt?: string
  /** Unit normalization alone does not establish cross-provider economic comparability. */
  comparability?: 'mixed-source'
}
export type ResearchFactClaim = {
  factId: string; metric: string; subject: string; period: string; unit: FactUnit; value: FactValue
  scope: string[]; decimals?: number
}
export type FactAuditInput = { snapshot?: Partial<ResearchSnapshot>; evaluation?: Partial<Evaluation>; companyData?: unknown; facts?: ResearchFact[]; flowWindows?: Array<{ start: string; end: string }> }
export type FactAuditIssue = {
  code: 'invalid-claim' | 'missing-fact' | 'basis-mismatch' | 'unit-mismatch' | 'value-mismatch' | 'ambiguous-fact' | 'accounting-causality' | 'unsupported-expectation' | 'company-consistency'
  severity: 'error' | 'warning'; path: string; detail: string; factIds: string[]
  expected?: FactValue; actual?: FactValue
}
export type FactAuditResult = {
  version: 1; status: 'failed' | 'warning' | 'passed' | 'not-assessed'
  issues: FactAuditIssue[]; checkedClaims: number; checkedNarrativeClaims: number; factCount: number
  /** This is a bounded fact audit, never a certification of all prose or investment merit. */
  coverage: 'structured-claims-and-targeted-narrative'
}
const finite = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value)
const values = (value: FactValue): number[] => Array.isArray(value) ? value : [value]
const validValue = (value: unknown): value is FactValue => finite(value) || Array.isArray(value) && value.length === 2 && value.every(finite)
const sameScope = (a: string[], b: string[]) => JSON.stringify([...new Set(a)].sort()) === JSON.stringify([...new Set(b)].sort())

/** Serializable and pure: safe for generation, archived-report inspection, and browser UI. */
export function buildResearchFactRegistry(input: FactAuditInput): ResearchFact[] {
  const facts: ResearchFact[] = []
  const snapshot = input.snapshot, evaluation = input.evaluation
  const decisions = evaluation?.decisions || []
  const period = evaluation?.expectedSession || snapshot?.asOf?.slice(0, 10) || ''
  const add = (metric: string, subject: string, at: string, unit: FactUnit, value: FactValue | null | undefined, scope: string[], evidenceIds: string[], label?: string) => {
    if (!at || !validValue(value)) return
    facts.push({ id: `fact:${metric}:${subject}:${at}:${encodeURIComponent([...scope].sort().join(','))}`, metric, subject, period: at, unit, value, scope: [...scope].sort(), evidenceIds: [...new Set(evidenceIds)], label })
  }
  for (const decision of decisions) {
    const date = decision.metrics?.date || period
    add('return20', decision.ticker, date, 'percent', decision.metrics?.return20Pct, [decision.ticker], decision.evidenceIds || [])
    if (decision.indexCode) add('relative20', decision.indexCode, date, 'percentage-point', decision.metrics?.relative20Pct, [decision.indexCode], decision.evidenceIds || [])
  }
  for (const [metric, unit, field] of [['return20', 'percent', 'return20Pct'], ['relative20', 'percentage-point', 'relative20Pct']] as const) {
    const eligible = metric === 'relative20' ? decisions.filter(d => d.indexCode) : decisions
    const numbers = eligible.map(d => d.metrics?.[field])
    // Partial coverage must never become a whole-pool range.
    if (eligible.length && eligible.length === decisions.length && numbers.every(finite) && eligible.every(d => d.metrics?.date === period)) {
      add(metric, 'research-universe', period, unit, [Math.min(...numbers), Math.max(...numbers)], eligible.map(d => metric === 'relative20' ? d.indexCode! : d.ticker), eligible.flatMap(d => d.evidenceIds || []))
    }
  }
  const markets = decisions.map(d => d.conditions?.find(c => c.key === 'market'))
  if (markets.length && markets.every(c => finite(c?.value) && c?.value === markets[0]?.value)) {
    add('benchmark-ma60-deviation', snapshot?.profile?.benchmark || evaluation?.profile?.benchmark || 'benchmark', period, 'ratio', markets[0]!.value as number, [], markets.flatMap(c => c?.evidenceIds || []))
  }
  const liquidity = decisions.map(d => d.conditions?.find(c => c.key === 'liquidity'))
  if (liquidity.length && liquidity.every(c => finite(c?.value) && finite(c?.threshold) && c?.operator === '>=' && c.threshold === liquidity[0]?.threshold)) {
    add('liquidity-qualified-count', 'research-universe', period, 'count', liquidity.filter(c => (c!.value as number) >= (c!.threshold as number)).length, decisions.map(d => d.ticker), liquidity.flatMap(c => c?.evidenceIds || []), `20日平均成交额≥${liquidity[0]!.threshold}元`)
  }
  // Net amount availability is independent of the netPct/trading-rule gate.
  const sectors = [...new Set(snapshot?.profile?.sectors || evaluation?.profile?.sectors || [])]
  const flows = (snapshot?.sectorFlows || []).filter(f => f.date <= period && sectors.includes(f.sector))
  const observedDates = [...new Set(flows.map(f => f.date))].sort()
  const lastDate = observedDates.at(-1)
  const calendar = snapshot?.calendar || []
  const sessions = calendar.length
    ? [...new Set(calendar.filter(d => d.open && d.date >= (observedDates[0] || '') && d.date <= (lastDate || '')).map(d => d.date))].sort()
    : observedDates
  const daily = new Map<string, typeof flows>()
  for (const date of sessions) {
    const rows = flows.filter(f => f.date === date)
    if (sectors.length && rows.length === sectors.length && sectors.every(sector => rows.filter(f => f.sector === sector).length === 1) && rows.every(f => finite(f.net) && !!f.evidenceId)) daily.set(date, rows)
  }
  const windows = [...sessions.map(start => ({start, end: lastDate!})), ...(input.flowWindows || [])]
  for (const {start, end} of windows) {
    if (start > end || end > period || !daily.has(start) || !daily.has(end)) continue
    const dates = sessions.filter(date => date >= start && date <= end)
    if (!dates.length || dates.some(date => !daily.has(date))) continue
    const window = dates.flatMap(date => daily.get(date)!)
    add('sector-flow-sum', 'research-universe', `${start}/${end}`, 'CNY', window.reduce((sum, f) => sum + f.net, 0), sectors, window.map(f => f.evidenceId), `${dates.length}日领域主力净流入`)
    const ids = new Set(window.map(f=>f.evidenceId))
    const sources = new Set((snapshot?.evidence || []).filter(e=>ids.has(e.id)).map(e=>e.source))
    if (sources.size > 1) facts[facts.length-1].comparability = 'mixed-source'
  }
  for (const etf of snapshot?.etfs || []) {
    for (const holding of etf.holdings || []) {
      if (holding.period && holding.evidenceId && finite(holding.weight) && holding.weight >= 0 && holding.weight <= 100) {
        add('disclosed-holding-weight', etf.ticker, holding.period, 'percent', holding.weight, [holding.code], [holding.evidenceId], holding.name)
      }
    }
    const segmentGroups = new Map<string, typeof etf.holdings>()
    for (const holding of etf.holdings || []) {
      const companies = (snapshot?.companies || []).filter(company => company.code === holding.code)
      if (companies.length !== 1 || !companies[0].segment || !holding.period || !holding.evidenceId || !finite(holding.weight) || holding.weight < 0 || holding.weight > 100) continue
      const segment = companies[0].segment, key = `${holding.period}:${segment}`
      segmentGroups.set(key, [...(segmentGroups.get(key) || []), holding])
    }
    for (const [key, holdings] of segmentGroups) {
      if (new Set(holdings.map(h => h.code)).size !== holdings.length) continue
      add('disclosed-segment-weight', etf.ticker, holdings[0].period!, 'percent', holdings.reduce((sum,h) => sum + h.weight!,0), holdings.map(h => h.code), holdings.map(h => h.evidenceId), key.slice(11))
    }
  }
  // Identical duplicate index facts are merged; conflicting definitions survive for the auditor.
  const merged = new Map<string, ResearchFact>()
  for (const fact of [...facts, ...(input.facts || [])]) {
    const identity = JSON.stringify({ ...fact, evidenceIds: [], label: undefined })
    const prior = merged.get(identity)
    merged.set(identity, prior ? { ...prior, evidenceIds: [...new Set([...prior.evidenceIds, ...fact.evidenceIds])] } : fact)
  }
  return [...merged.values()]
}

function convert(value: FactValue, from: FactUnit, to: FactUnit): FactValue | null {
  const factor = from === to ? 1 : from === 'ratio' && to === 'percent' ? 100 : from === 'percent' && to === 'ratio' ? .01 : from === 'CNY' && to === 'CNY-100m' ? 1e-8 : from === 'CNY-100m' && to === 'CNY' ? 1e8 : null
  if (factor === null) return null
  return Array.isArray(value) ? [value[0] * factor, value[1] * factor] : value * factor
}
function matches(expected: FactValue, actual: FactValue, decimals: number) {
  const left = values(expected), right = values(actual)
  return left.length === right.length && left.every((value, i) => Math.abs(value - right[i]) <= .5 * 10 ** -decimals + 1e-9)
}
const numberToken = '[+−-]?\\d+(?:\\.\\d+)?'
const parseNumber = (value: string) => Number(value.replace('−', '-'))
const decimalsOf = (value: string) => Math.min(8, value.split('.')[1]?.length || 0)

/** A duration attached to the amount outranks a bare narrative event date.
 * Reject digit suffixes and day-of-month tokens (e.g. 9月7日累计). */
function cumulativeFlowDays(text:string):number|null {
  const match=text.match(/(?<![月\d])([1-9]\d{0,2})\s*(?:个交易日|日)(?=累计|合计|汇总)/)
  if(match)return Number(match[1])
  const chinese=text.match(/([一二三四五六七八九十]+)日(?=累计|合计|汇总)/)?.[1]
  if(!chinese)return null
  if(chinese.length===1)return '一二三四五六七八九十'.indexOf(chinese)+1
  const tens=chinese.match(/^([一二三四五六七八九])?十([一二三四五六七八九])?$/)
  return tens ? (tens[1] ? '一二三四五六七八九'.indexOf(tens[1])+1 : 1)*10 + (tens[2] ? '一二三四五六七八九'.indexOf(tens[2])+1 : 0) : null
}

function resolveFlowWindow(text:string, reference:string):{start:string;end:string}|null {
  const range=text.match(/(?:(\d{4})年)?(\d{1,2})月(\d{1,2})日?至(?:(\d{1,2})月)?(\d{1,2})日/)
  const date=(year:string,month:string,day:string)=>`${year}-${month.padStart(2,'0')}-${day.padStart(2,'0')}`
  if(range)return {start:date(range[1]||reference.slice(0,4),range[2],range[3]),end:date(range[1]||reference.slice(0,4),range[4]||range[2],range[5])}
  if(cumulativeFlowDays(text)!==null)return null
  const day=text.match(/(?:(\d{4})年)?(?:(\d{1,2})月)?(\d{1,2})日(?:当日|当天)/)
    || text.match(/(?:(\d{4})年)?(\d{1,2})月(\d{1,2})日(?!至)/)
  if(day){const at=date(day[1]||reference.slice(0,4),day[2]||reference.slice(5,7),day[3]);return {start:at,end:at}}
  if(/当日|当天/.test(text)&&reference)return {start:reference,end:reference}
  return null
}

/** Model objects may attach factChecks: ResearchFactClaim[] to any claim or section.
 * Missing metadata is rejected rather than inferred from a valid-looking citation ID. */
export function auditResearchFacts(output: unknown, input: FactAuditInput = {}): FactAuditResult {
  // Resolve dates within each prose field; a following "10日当日" inherits
  // the month from its preceding range, never a ten-session duration.
  const referenceDate = input.evaluation?.expectedSession || input.snapshot?.asOf?.slice(0,10) || ''
  const requestedWindows: Array<{start:string;end:string}> = []
  const collectWindows = (value:unknown):void => {
    if (typeof value === 'string') {
      if (/^\s*[\[{]/.test(value)) { try { collectWindows(JSON.parse(value)); return } catch { /* prose */ } }
      let reference = referenceDate
      for (const clause of value.split(/[。；;，,\n]/)) {
        const window = resolveFlowWindow(clause,reference)
        if (window) { requestedWindows.push(window); reference = window.end }
      }
    } else if (Array.isArray(value)) value.forEach(collectWindows)
    else if (value && typeof value === 'object') Object.values(value).forEach(collectWindows)
  }
  collectWindows(output)
  const registry = buildResearchFactRegistry({...input,flowWindows:[...(input.flowWindows || []),...requestedWindows]}), issues: FactAuditIssue[] = []
  let checkedClaims = 0, checkedNarrativeClaims = 0
  const issue = (code: FactAuditIssue['code'], path: string, detail: string, facts: ResearchFact[] = [], extra: Partial<FactAuditIssue> = {}) => issues.push({ code, path, detail, factIds: facts.map(f => f.id), severity: 'error', ...extra })
  if (input.snapshot?.id && input.evaluation?.snapshotId && input.snapshot.id !== input.evaluation.snapshotId) issue('basis-mismatch','input.snapshot','行情评估与冻结快照编号不一致，不能跨快照验证报告')
  const compare = (fact: ResearchFact, unit: FactUnit, actual: FactValue, decimals: number, path: string) => {
    const expected = convert(fact.value, fact.unit, unit)
    if(fact.comparability==='mixed-source') {
      issue('basis-mismatch',path,'该日期范围混合不同来源的资金统计，单位统一不代表主力净额与行业净额口径一致；以下仅为冻结字段算术和，不能作为已核验的经济流量',[fact],{severity:'warning',expected:expected??undefined,actual})
      if(expected!==null&&!matches(expected,actual,decimals))issue('value-mismatch',path,`跨来源冻结字段算术和为${JSON.stringify(expected)} ${unit}，正文为${JSON.stringify(actual)}；需先统一底层统计口径`,[fact],{severity:'warning',expected,actual})
      return
    }
    if (expected === null) issue('unit-mismatch', path, `${fact.metric}单位应为${fact.unit}，不能作为${unit}引用`, [fact])
    else if (!matches(expected, actual, decimals)) issue('value-mismatch', path, `${fact.metric}（${fact.subject}，${fact.period}）冻结值为${JSON.stringify(expected)} ${unit}，声明为${JSON.stringify(actual)}`, [fact], { expected, actual })
  }
  const structured = (raw: unknown, path: string) => {
    checkedClaims++
    const row = raw && typeof raw === 'object' ? raw as Record<string, unknown> : {}
    if (!['factId', 'metric', 'subject', 'period', 'unit'].every(key => typeof row[key] === 'string') || !Array.isArray(row.scope) || !row.scope.every(s => typeof s === 'string') || !validValue(row.value) || row.decimals !== undefined && (!Number.isInteger(row.decimals) || (row.decimals as number) < 0 || (row.decimals as number) > 8)) {
      issue('invalid-claim', path, '事实声明必须包含factId、metric、subject、period、unit、scope和有限数值；decimals限定0至8'); return
    }
    const claim = row as unknown as ResearchFactClaim
    const facts = registry.filter(f => f.id === claim.factId)
    if (!facts.length) { issue('missing-fact', path, `冻结事实不存在：${claim.factId}`); return }
    if (facts.length !== 1) { issue('ambiguous-fact', path, '冻结事实编号存在冲突，不能确认数值', facts); return }
    const fact = facts[0]
    if (fact.metric !== claim.metric || fact.subject !== claim.subject || fact.period !== claim.period || !sameScope(fact.scope, claim.scope)) {
      issue('basis-mismatch', path, '引用事实的指标、对象、期间或成分范围与声明不一致', [fact]); return
    }
    compare(fact, claim.unit, claim.value, claim.decimals ?? 2, path)
  }
  const one = (metric: string) => { const facts = registry.filter(f => f.metric === metric); return facts.length === 1 ? facts[0] : undefined }
  const validExpectation = (basis: unknown) => {
    if (!basis || typeof basis !== 'object') return false
    const row = basis as Record<string, unknown>
    const actuals = registry.filter(f => f.id === row.actualFactId), forecasts = registry.filter(f => f.id === row.consensusFactId)
    if (actuals.length !== 1 || forecasts.length !== 1) return false
    const actual = actuals[0], forecast = forecasts[0]
    const converted = convert(forecast.value, forecast.unit, actual.unit)
    return actual.basis === 'actual' && forecast.basis === 'consensus' && actual.metric === forecast.metric && actual.subject === forecast.subject && actual.period === forecast.period && sameScope(actual.scope, forecast.scope) && finite(actual.value) && finite(converted) && actual.value > converted && !!actual.evidenceIds.length && !!forecast.evidenceIds.length && !!actual.availableAt && !!forecast.availableAt && Date.parse(forecast.availableAt) < Date.parse(actual.availableAt)
  }
  const auditFlowNarrative = (text:string,path:string) => {
    let reference = referenceDate || registry.find(f => f.metric === 'sector-flow-sum')?.period.split('/')[1] || ''
    for (const sentence of text.split(/[。；;，,\n]/)) {
      const window = resolveFlowWindow(sentence,reference)
      if (window) reference = window.end
      if (/如果|若|假设|情景|目标|不能|不可|不应|并非/.test(sentence)) continue
      // A historical duration anchored to an event date is not a latest-ending
      // window. Leave unresolved prose to structured facts, never guess its start.
      if(!window && cumulativeFlowDays(sentence)!==null && /截至|截止|自\d{1,2}月\d{1,2}日/.test(sentence))continue
      const flowMatch = sentence.match(new RegExp(`(?:领域|板块|行业)[^。；]{0,30}?(?:合计|累计|汇总)[^。；]{0,8}?(净流出|流出|净流入|流入)[^\\d+−-]{0,5}(${numberToken})\\s*亿元`)) || sentence.match(new RegExp(`(?:领域|板块|行业)[^。；]{0,30}?(净流出|流出|净流入|流入)(?:合计|累计|汇总)[^\\d+−-]{0,5}(${numberToken})\\s*亿元`))
      if(!flowMatch)continue
      const matchingFlows = registry.filter(f => {
        if (f.metric !== 'sector-flow-sum') return false
        if (window) return f.period === `${window.start}/${window.end}`
        const days = f.label?.match(/^(\d+)日/)?.[1]
        const latest = registry.filter(other => other.metric === 'sector-flow-sum').map(other => other.period.split('/')[1]).sort().at(-1)
        const cumulativeDays = cumulativeFlowDays(sentence)
        if(cumulativeDays!==null)return Number(days)===cumulativeDays && f.period.split('/')[1]===latest
        // A date token is never a duration. Explicit duration syntax only.
        if (/\d{1,2}日(?:当日|当天)|当日|当天|\d{1,2}月\d{1,2}日/.test(sentence)) return false
        const chineseDays:Record<string,string>={'1':'一','2':'二','3':'三','4':'四','5':'五','6':'六','7':'七','8':'八','9':'九','10':'十'}
        return f.period.split('/')[1] === latest && !!days && (new RegExp(`(?:^|连续|近|过去|领域|板块|行业|\\s)${days}日(?!当日|当天)`).test(sentence) || !!chineseDays[days] && new RegExp(`(?:^|连续|近|过去|领域|板块|行业|\\s)${chineseDays[days]}日(?!当日|当天)`).test(sentence))
      })
      const flow = matchingFlows.length === 1 ? matchingFlows[0] : undefined
      // Require an explicit matching day count; other windows and market-wide flows are not comparable.
      const mentionedSectors = flow?.scope.filter(sector => flowMatch?.[0].includes(sector)) || []
      const scopeMatches = !mentionedSectors.length || mentionedSectors.length === flow?.scope.length
      if (flow && flowMatch && scopeMatches && !/(?:全市场|两市|北向)[^，,]{0,8}$/.test(sentence.slice(0,flowMatch.index))) {
        checkedNarrativeClaims++; compare(flow, 'CNY-100m', Math.abs(parseNumber(flowMatch[2])) * (flowMatch[1].includes('出') ? -1 : 1), decimalsOf(flowMatch[2]), path)
      }
    }
  }
  const narrative = (text: string, path: string, expectationSupported: boolean, subject?: string, operatingCashContext = false) => {
    // Historical report prose is intentionally carried forward verbatim for
    // comparison. It must not be checked against the current snapshot's single
    // latest-period fact; currentEvidence in the same row is still audited.
    if (/\.historyComparison\[\d+\]\.previousOpportunity$/.test(path)) return
    auditFlowNarrative(text,path)
    // Explicit metric anchors only. Dates, codes, forecasts, and unrelated percentages are untouched.
    for (const sentence of text.split(/[。；;\n]/)) {
      const hypothetical = /如果|若|假设|情景|目标|需验证|尚待|不能|不可|不应|并非|无法|未核验|缺乏|缺少/.test(sentence.split(/[，,]/)[0])
      if (hypothetical) continue
      const ma = one('benchmark-ma60-deviation')
      const maMatch = sentence.match(new RegExp(`基准[^，,。；]{0,16}?(低于|高于)(?:MA60|60日均线)\\s*(?:约)?\\s*(${numberToken})\\s*%`, 'i'))
      if (ma && maMatch) { checkedNarrativeClaims++; compare(ma, 'percent', Math.abs(parseNumber(maMatch[2])) * (maMatch[1] === '低于' ? -1 : 1), decimalsOf(maMatch[2]), path) }
      const range = sentence.match(new RegExp(`(?:20日|20个交易日)(相对(?:基准)?收益|绝对收益|收益|涨跌幅)[^。；，,\\d+−-]{0,8}(${numberToken})\\s*(%|个百分点)?\\s*(?:至|到|～|~|—)\\s*(${numberToken})\\s*(%|个百分点)`))
      const explicitlyWholeUniverse = /(?:全部|全池|全体|本轮|研究范围|研究池|\d+只)[^。；，,]{0,16}(?:产品|基金|ETF)/i.test(sentence)
      if (range && explicitlyWholeUniverse && !subject && !/\b\d{6}\b|云计算系列|芯片系列/.test(sentence)) {
        const metric = range[1].includes('相对') ? 'relative20' : 'return20'
        const fact = registry.find(f => f.metric === metric && f.subject === 'research-universe')
        if (fact) {
          checkedNarrativeClaims++
          const rawActual=[parseNumber(range[2]),parseNumber(range[4])]
          const directionalLoss=metric==='relative20'&&/(?:劣后|跑输|落后)/.test(sentence)
          const directionalGain=metric==='relative20'&&/(?:领先|跑赢|超越)/.test(sentence)
          const signed=directionalLoss?rawActual.map(value=>-Math.abs(value)):directionalGain?rawActual.map(value=>Math.abs(value)):rawActual
          const actual = signed.sort((a,b) => a-b) as [number, number]
          // Relative returns are percentage points, but compare magnitudes as well to expose metric substitution.
          compare(fact, fact.unit, actual, Math.min(decimalsOf(range[2]), decimalsOf(range[4])), path)
          if (metric === 'relative20' && range[5] === '%') issue('unit-mismatch', path, '相对基准收益差应标注百分点，不能与基金绝对收益百分比混用', [fact])
        }
      }
      const count = one('liquidity-qualified-count')
      const countMatch = sentence.match(/(\d+)只(?:基金|ETF|产品)?(?:的)?(?:20日平均成交额|流动性)(?:达标|超过门槛|满足门槛)/i)
      if (count && countMatch) { checkedNarrativeClaims++; compare(count, 'count', Number(countMatch[1]), 0, path) }
      const thresholdCount = sentence.match(/(\d+)只(?:产品|基金|ETF)(?:20日均额|20日平均成交额)(?:超|超过)(\d+(?:\.\d+)?)(万元|亿元)门槛/i)
      const frozenThreshold = count?.label?.match(/≥(\d+(?:\.\d+)?)元/)?.[1]
      if (count && thresholdCount && frozenThreshold && Number(thresholdCount[2]) * (thresholdCount[3] === '万元' ? 1e4 : 1e8) === Number(frozenThreshold)) {
        checkedNarrativeClaims++; compare(count,'count',Number(thresholdCount[1]),0,path)
      }
      const mentionedHoldings = registry.filter(f => f.metric === 'disclosed-holding-weight' && (sentence.includes(f.subject) || subject === f.subject) && f.label && f.label.length > 1 && sentence.includes(f.label))
      const weight = sentence.match(new RegExp(`(?:披露权重|持仓权重|权重合计|权重)(?:合计|约|为|达|占|：|:|\\s){0,5}(${numberToken})\\s*%`))
      if (weight && mentionedHoldings.length && new Set(mentionedHoldings.map(f => f.subject)).size === 1 && new Set(mentionedHoldings.map(f => f.period)).size === 1 && new Set(mentionedHoldings.map(f => f.id)).size === mentionedHoldings.length && mentionedHoldings.every(f => finite(f.value))) {
        if (/等[^，。；]{0,12}(?:企业|公司)[^，。；]{0,8}权重/.test(sentence)) {
          const groups = registry.filter(f => f.metric === 'disclosed-segment-weight' && f.subject === mentionedHoldings[0].subject && f.period === mentionedHoldings[0].period && f.label && sentence.includes(f.label) && mentionedHoldings.every(h => h.scope.every(code => f.scope.includes(code))))
          const actual = parseNumber(weight[1])
          // A verified subset is a lower bound. Do not mislabel an incompletely mapped group as its exact total.
          if (groups.length === 1 && finite(groups[0].value) && actual < groups[0].value - .5 * 10 ** -decimalsOf(weight[1])) {
            checkedNarrativeClaims++
            issue('value-mismatch',path,`${groups[0].subject}的${groups[0].label}冻结披露样本合计已达${groups[0].value.toFixed(2)}%，声明的${actual}%低于已核验子集；不能引用其他成分组的权重`,[groups[0]],{expected:groups[0].value,actual})
          } else issue('basis-mismatch',path,'披露权重未列明完整成分范围，不能确认“等企业”是否对应所引用的成分组合计',mentionedHoldings,{severity:'warning'})
        }
        else {
          const fact = { ...mentionedHoldings[0], value: mentionedHoldings.reduce((sum, f) => sum + (f.value as number), 0) }
          checkedNarrativeClaims++; compare(fact, 'percent', parseNumber(weight[1]), decimalsOf(weight[1]), path)
        }
      }
      const cash = operatingCashContext || /经营(?:活动)?现金(?:流(?:量)?(?:净额)?)?(?:与|对|\/)?(?:净)?利润|经营现金(?:流)?转化/.test(sentence)
      const capex = /资本开支(?:收缩|下降|减少)|削减资本开支/.test(sentence)
      if (cash && capex && /归因|源于|由于|导致|因为|带来|解释|得益于|收缩期现金回流/.test(sentence)) issue('accounting-causality', path, '资本开支属于投资现金流，不能直接解释经营现金流／利润比值；需经营现金流调节表、营运资本与同期间口径支持', [], { severity: 'warning' })
      const conditionalPath = /\.(?:scenarios|watchlist|watchPoints|actionConditions|conditions|invalidation|verification)(?:\.|\[|$)/.test(path)
      const negatedExpectation = /(?:不宣称|不能|不可|不应|无法|未核验|缺乏|缺少)[^，,。；]{0,35}超(?:出)?(?:市场)?预期/.test(sentence)
      if (!conditionalPath && !negatedExpectation && !expectationSupported && /超(?:出)?(?:市场)?预期/.test(sentence)) issue('unsupported-expectation', path, '“超预期”需同指标、同期间且早于实际披露的一致预期及实际值；同比增长或新闻评价不能替代预期差证据', [], { severity: 'warning' })
    }
  }
  const visit = (value: unknown, path: string, expectationSupported = false, subject?: string, operatingCashContext = false) => {
    if (typeof value === 'string') {
      if (/^\s*[\[{]/.test(value)) { try { const nested:unknown = JSON.parse(value); visit(nested,path,expectationSupported,subject,operatingCashContext); return } catch { /* Plain prose with a bracket prefix. */ } }
      narrative(value, path, expectationSupported, subject,operatingCashContext); return
    }
    if (Array.isArray(value)) { value.forEach((v,i) => visit(v, `${path}[${i}]`,false,subject)); return }
    if (!value || typeof value !== 'object') return
    const row = value as Record<string,unknown>
    const currentSubject = typeof row.ticker === 'string' ? row.ticker : subject
    for (const [key, child] of Object.entries(value)) {
      if (key === 'factChecks') {
        if (Array.isArray(child)) child.forEach((c,i) => structured(c, `${path}.factChecks[${i}]`))
        else issue('invalid-claim', `${path}.factChecks`, 'factChecks必须是结构化声明数组')
      } else if (!['source', 'date', 'evidenceIds', 'factAudit', 'referenceIssues', 'referenceCorrections', 'expectationBasis'].includes(key)) visit(child, `${path}.${key}`, key === 'claim' && validExpectation(row.expectationBasis),currentSubject,key === 'operatingEvidence' && typeof row.selectionReason === 'string' && /经营现金流转化/.test(row.selectionReason))
    }
  }
  let parsed = output
  if (typeof output === 'string') { try { parsed = JSON.parse(output) } catch { /* Legacy prose. */ } }
  visit(parsed, 'report')
  return { version: 1, status: issues.some(i => i.severity === 'error') ? 'failed' : issues.length ? 'warning' : checkedClaims + checkedNarrativeClaims ? 'passed' : 'not-assessed', issues, checkedClaims, checkedNarrativeClaims, factCount: registry.length, coverage: 'structured-claims-and-targeted-narrative' }
}

/** Unified entry point for generation, read APIs and UI. Never writes archived data. */
export function auditReportFacts(value: unknown, input: FactAuditInput = {}): FactAuditResult {
  const result = auditResearchFacts(value, input)
  const companyIssues = auditResearchConsistency(value, input.companyData)
  result.issues.push(...companyIssues.map(issue => ({ ...issue, code: 'company-consistency' as const, factIds: [] })))
  if (result.issues.some(issue => issue.severity === 'error')) result.status = 'failed'
  else if (result.issues.length) result.status = 'warning'
  return result
}
