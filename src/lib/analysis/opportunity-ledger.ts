import { disclosedExposure, enrichCatalysts } from './disclosed-exposure'
import { adjustedBars, validBars } from '@/lib/research/engine'
import { sessionBoundary } from '@/lib/research/time'
import type { ResearchSnapshot } from '@/lib/research/contracts'
import { identifyOpportunity, restoreOpportunityIdentity, matchOpportunity, assessOpportunityNovelty, type OpportunityIdentity, type IdentityMatch, type OpportunityNovelty, type EconomicFact } from './opportunity-identity'

type Row = Record<string, unknown>
const object = (value: unknown): Row => {
  if (typeof value === 'string') { try { return object(JSON.parse(value)) } catch { return {} } }
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Row : {}
}
const rows = (value: unknown) => Array.isArray(value) ? value.map(object) : []
const strings = (value: unknown): string[] => Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : []

export type ResearchOpportunity = {
  identity?: OpportunityIdentity
  identityHistory?: OpportunityIdentity[]
  identityMatch?: IdentityMatch
  legacyIds?: string[]
  titleAliases?: string[]
  novelty?: OpportunityNovelty
  economicFactIds?: string[]
  unresolvedCompanies?: string[]
  opportunityKey?: string
  informationStatus?: string
  disclosureTimeline?: Array<{eventId:string;observedPublicationAt:string;firstDisclosureAt:string|null;reportPeriod:string|null;firstDisclosureEvidenceIds?:string[]}>
  discoveryPlan?: Array<{step:string;status:string;detail:string}>
  id: string; title: string; firstSeenAt: string; reviewedAt: string; state: string
  companies: string[]; evidenceIds: string[]; evidenceDates: string[]; sourceEventIds: string[]
  newEvidenceIds: string[]; hypothesis: string; verification: string; invalidation: string
  exposure: ReturnType<typeof disclosedExposure>; discoveryCandidates: string[]
  pricingAssessment: string; nextReview: string; outcome: string
  forwardObservation?: Array<{ ticker: string; start: string | null; end: string | null; returnPct: number | null; excessReturnPct: number | null; sessions: number; basis: string }>
}

function forwardObservation(snapshot: ResearchSnapshot | undefined, firstSeenAt: string, tickers: string[]) {
  if(!snapshot)return []
  const cutoff=sessionBoundary(snapshot.calendar,snapshot.asOf).expectedSession
  if(!cutoff)return []
  const benchmark=validBars(snapshot.benchmarkBars,cutoff)
  return tickers.map(ticker=>{
    const etf=snapshot.etfs.find(item=>item.ticker===ticker)
    const series=etf?adjustedBars(etf,cutoff):null
    const bars=series?.adjusted&&!series.discontinuity?series.bars.filter(bar=>Date.parse(`${bar.date}T09:30:00+08:00`)>Date.parse(firstSeenAt)):[]
    const first=bars[0],last=bars.at(-1),benchmarkFirst=benchmark.find(bar=>bar.date===first?.date),benchmarkLast=benchmark.find(bar=>bar.date===last?.date)
    const returnPct=first&&last&&first.open>0?(last.close/first.open-1)*100:null
    const benchmarkReturn=benchmarkFirst&&benchmarkLast&&benchmarkFirst.open>0?(benchmarkLast.close/benchmarkFirst.open-1)*100:null
    return {ticker,start:first?.date||null,end:last?.date||null,returnPct,excessReturnPct:returnPct!==null&&benchmarkReturn!==null?returnPct-benchmarkReturn:null,sessions:bars.length,
      basis:'首次记录之后的下一可观察开盘至最近完整收盘，使用核验复权价格；为机会价格跟踪，未扣成本、未模拟成交，不证明因果或策略收益'}
  })
}

/** Extract only an explicit calendar reporting period, never the article date. */
export function disclosedReportPeriod(event:Row):string|null {
  const text=String(event.excerpt||event.content||'')
  const periods=new Set<string>()
  for(const match of text.matchAll(/(20\d{2})\s*年\s*(上半年|半年度|第一季度|一季度|第三季度|三季度)/g)){
    periods.add(`${match[1]}-${/半年/.test(match[2])?'06-30':/一/.test(match[2])?'03-31':'09-30'}`)
  }
  return periods.size===1?[...periods][0]:null
}

function isOpportunity(item: Row): item is Row & ResearchOpportunity {
  return ['id','title','firstSeenAt','reviewedAt','state','hypothesis','verification','invalidation','pricingAssessment','nextReview','outcome'].every(key => typeof item[key] === 'string') &&
    ['companies','evidenceIds','evidenceDates','sourceEventIds','newEvidenceIds','exposure','discoveryCandidates'].every(key => Array.isArray(item[key]))
}

const union = (...values: Array<string[] | undefined>) => [...new Set(values.flatMap(value => value || []))].sort()
function mergeRecords(old: ResearchOpportunity, latest: ResearchOpportunity): ResearchOpportunity {
  const timeline = new Map((old.disclosureTimeline || []).map(row => [row.eventId, row]))
  for (const row of latest.disclosureTimeline || []) {
    const previous = timeline.get(row.eventId)
    timeline.set(row.eventId, previous?.firstDisclosureAt && !row.firstDisclosureAt ? { ...row,
      firstDisclosureAt: previous.firstDisclosureAt, firstDisclosureEvidenceIds: previous.firstDisclosureEvidenceIds } : row)
  }
  return { ...latest, id: old.id,
    firstSeenAt: Date.parse(old.firstSeenAt) <= Date.parse(latest.firstSeenAt) ? old.firstSeenAt : latest.firstSeenAt,
    legacyIds: union(old.legacyIds, latest.legacyIds, [old.id, latest.id]),
    titleAliases: union(old.titleAliases, latest.titleAliases, [old.title, latest.title]),
    identityHistory: [...new Map([...(old.identityHistory || []), ...(latest.identityHistory || []), old.identity, latest.identity]
      .filter((identity): identity is OpportunityIdentity => !!identity).map(identity => [identity.key, identity])).values()],
    evidenceIds: union(old.evidenceIds, latest.evidenceIds), evidenceDates: union(old.evidenceDates, latest.evidenceDates),
    sourceEventIds: union(old.sourceEventIds, latest.sourceEventIds), economicFactIds: union(old.economicFactIds, latest.economicFactIds),
    disclosureTimeline: [...timeline.values()],
  }
}

/** Idempotent legacy migration in memory. Exact canonical identities deduplicate
 * renamed historical rows; incomplete/competing identities remain separate. */
export function deduplicateOpportunityHistory(history: ResearchOpportunity[]): ResearchOpportunity[] {
  const result: ResearchOpportunity[] = []
  for (const row of [...history].sort((a, b) => Date.parse(a.reviewedAt) - Date.parse(b.reviewedAt) || a.id.localeCompare(b.id))) {
    const identity = restoreOpportunityIdentity(row)
    const latest = { ...row, identity }
    const index = result.findIndex(old => old.identity!.key === identity.key ||
      (old.id === row.id && matchOpportunity(identity, [{ id: old.id, identity: old.identity! }]).matchedId === old.id))
    if (index < 0) result.push(result.some(old => old.id === latest.id)
      ? { ...latest, id: identity.key, legacyIds: union(latest.legacyIds, [latest.id]) } : latest)
    else result[index] = mergeRecords(result[index], latest)
  }
  return result
}

/** A persisted research queue, separate from trading decisions. No source-linked
 * event is automatically promoted to verified alpha or a realized opportunity. */
export function buildOpportunityLedger(input: {
  asOf: string; news: unknown; events: unknown; holdings: unknown; decisions: unknown; graph: unknown; history?: unknown; snapshot?: ResearchSnapshot
  // Source-reviewed facts supplied by a separate verifier, never copied from AI catalyst claims.
  economicFacts?: EconomicFact[]
}): ResearchOpportunity[] {
  const previous = deduplicateOpportunityHistory(rows(input.history).flatMap(item => rows(item.opportunityLedger)).filter(isOpportunity)
    .filter(item => Number.isFinite(Date.parse(item.firstSeenAt)) && Date.parse(item.firstSeenAt) <= Date.parse(item.reviewedAt) && Date.parse(item.reviewedAt) <= Date.parse(input.asOf)))
  const events = rows(input.events), decisions = rows(input.decisions), graph = object(input.graph)
  const catalysts = rows(enrichCatalysts(object(input.news),input.holdings,input.snapshot?.companies).catalysts)
  const identities = catalysts.map(identifyOpportunity)
  const matches = identities.map(identity => matchOpportunity(identity, previous.map(item => ({ id: item.id, identity: item.identity! }))))
  const current = catalysts.map((catalyst, index) => {
    const companies = strings(catalyst.affectedCompanies).sort()
    const hypothesis = String(catalyst.event || '')
    const identity = identities[index]
    const proposed = matches[index]
    // Multiple distinct current identities claiming one old row are a split/ambiguity,
    // not permission to collapse independent company groups under the same ID.
    const competing = proposed.matchedId && matches.some((candidate, i) => candidate.matchedId === proposed.matchedId && identities[i].key !== identity.key)
    const match: IdentityMatch = competing ? { ...proposed, matchedId: null, reason: 'ambiguous' } : proposed
    const id = identity.key
    const opportunityKey=String(catalyst.opportunityKey||'').trim()
    const old = previous.find(item => item.id === match.matchedId)
    const sourceEventIds = new Set(strings(catalyst.sourceEventIds))
    const linked = events.filter(event => event.status === 'evidence' && Date.parse(String(event.publishedAt || '')) <= Date.parse(input.asOf) && (sourceEventIds.has(String(event.id)) || String(event.title) === hypothesis))
    const evidenceIds = [...new Set(linked.flatMap(event => strings(event.evidenceIds)))]
    const novelty = assessOpportunityNovelty({ asOf: input.asOf, evidenceIds, sourceEventIds: linked.map(event => String(event.id)),
      previousEvidenceIds: old?.evidenceIds, previousSourceEventIds: old?.sourceEventIds, previousEconomicFactIds: old?.economicFactIds,
      economicFacts: input.economicFacts })
    const newEvidenceIds = novelty.newEvidenceIds
    const exposure = disclosedExposure(companies, input.holdings)
    const eligible = exposure.some(product => decisions.some(decision => decision.ticker === product.ticker && decision.state === 'eligible'))
    const eventSegments=new Set(linked.flatMap(event=>strings(event.segments)))
    const segmentCandidates=rows(graph.stages).flatMap(stage=>rows(stage.segments)).filter(segment=>eventSegments.has(String(segment.code)) || rows(segment.companies).some(company=>companies.includes(String(company.code)))).flatMap(segment=>rows(segment.etfs)).map(product=>String(product.code || '')).filter(code=>code && !decisions.some(decision=>decision.ticker===code))
    const candidates = [...segmentCandidates,...rows(graph.etfExposure).filter(product => !decisions.some(decision => decision.ticker === product.code) && rows(product.segments).some(segment => strings(segment.matchedCompanies).some(code => companies.includes(code)))).map(product => String(product.code))]
    const record: ResearchOpportunity = { id:old?.id||id, opportunityKey:opportunityKey||undefined,
      identity, identityMatch: match, unresolvedCompanies: strings(catalyst.unresolvedCompanies),
      novelty, economicFactIds: union(old?.economicFactIds, novelty.verifiedEconomicFacts.map(fact => fact.factId)),
      informationStatus:'来源记录新增仅说明本轮获得材料；首次披露、财报所属期与经济信息增量须分别核验，未核验不宣称超预期或机会兑现',
      disclosureTimeline:linked.map(event=>{
        const verified = event.firstDisclosureStatus === 'verified' && strings(event.firstDisclosureEvidenceIds).length > 0 &&
          strings(event.firstDisclosureEvidenceIds).every(id => strings(event.evidenceIds).includes(id)) &&
          Number.isFinite(Date.parse(String(event.firstDisclosureAt))) && Date.parse(String(event.firstDisclosureAt)) <= Date.parse(String(event.publishedAt))
        return {eventId:String(event.id),observedPublicationAt:String(event.publishedAt||''),firstDisclosureAt:verified?String(event.firstDisclosureAt):null,
          firstDisclosureEvidenceIds:verified?strings(event.firstDisclosureEvidenceIds):[],reportPeriod:disclosedReportPeriod(event)}
      }),
      discoveryPlan:exposure.length?[]:[
        {step:'候选发现',status:candidates.length?'待核验候选':'待检索',detail:candidates.length?`候选 ${[...new Set(candidates)].join('、')}；仅为图谱关联`:`检索披露持仓包含 ${companies.join('、')||'关联企业'} 的指数ETF；当前图谱无候选不代表市场无产品`},
        {step:'暴露核验',status:'待补资料',detail:'核验基金合同、跟踪指数、最新披露持仓日期与相关企业权重，不以基金名称代替穿透'},
        {step:'研究准入',status:'待补资料',detail:'在数据订阅纳入已核验候选，补齐日线、复权、指数、净值与费用后新建分析；选优不等于建仓'},
      ],title: hypothesis, firstSeenAt: String(old?.firstSeenAt || input.asOf), reviewedAt: input.asOf,
      state: !evidenceIds.length ? '早期线索' : eligible ? '配置候选，仍需执行复核' : exposure.length ? '待基本面与价格共同验证' : '待寻找有效ETF暴露',
      companies, evidenceIds, evidenceDates: [...new Set(linked.map(event => String(event.publishedAt || '')).filter(Boolean))],
      sourceEventIds: linked.map(event => String(event.id || '')).filter(Boolean), newEvidenceIds,
      hypothesis, verification: String(catalyst.conditions || '补充可证伪的订单、盈利或现金回收条件'),
      invalidation: String(catalyst.invalidation || '关键订单未兑现、盈利下修或来源被更正时重新审查；未复核不视为失效已发生'),
      exposure, discoveryCandidates: [...new Set(candidates)],
      pricingAssessment: String(catalyst.pricingAssessment || '尚无一致预期与事件前后价格证据，不能断言尚未定价'),
      nextReview: '下一完整交易日复核价格；在下一次订单、财报或公告披露时复核产业假设',
      outcome: novelty.newEconomicFactIds.length ? '已核验相对基线的经济事实新增，仍不证明超预期、尚未定价或机会兑现' : old ? newEvidenceIds.length || novelty.newSourceEventIds.length ? '出现新增来源记录，尚未证明经济信息新增或机会兑现' : '证据未更新，不能重复计为新机会' : '本轮首次记录，历史表现尚待前向观察',
      forwardObservation:forwardObservation(input.snapshot,String(old?.firstSeenAt || input.asOf),exposure.map(product=>product.ticker)),
    }
    return old ? mergeRecords(old, record) : record
  })
  // Do not silently drop an unresolved idea simply because this run did not rank it.
  const seen = new Set(current.map(item => item.id))
  const carried = previous.filter(item => !seen.has(String(item.id))).sort((a,b) => String(b.reviewedAt).localeCompare(String(a.reviewedAt))).filter(item => {
    if(seen.has(String(item.id))) return false
    seen.add(String(item.id)); return true
  }).map(item => ({ ...item, discoveryPlan:item.discoveryPlan||(rows(item.exposure).length?[]:[
    {step:'候选发现',status:'待复核',detail:`复核历史机会涉及 ${strings(item.companies).join('、')} 的指数ETF；候选关联未核验不视为实际暴露`},
    {step:'暴露核验',status:'待补资料',detail:'核验基金合同、跟踪指数及最新披露持仓权重'},
    {step:'研究准入',status:'待补资料',detail:'补齐候选订阅数据后重新评估；历史机会未复核不代表失效或已兑现'},
  ]),newEvidenceIds: [], novelty: assessOpportunityNovelty({asOf:input.asOf,sourceEventIds:[],evidenceIds:[]}), outcome: '本轮未重新验证，保留上一轮观点；不视为已兑现或已失效' }))
  const deduplicated = deduplicateOpportunityHistory([...current, ...carried])
  // Multiple mentions within this run are one observation with a union of new sources.
  return deduplicated.sort((a, b) => Date.parse(b.reviewedAt) - Date.parse(a.reviewedAt)).map(item => {
    const mentions = current.filter(row => row.id === item.id || row.identity?.key === item.identity?.key)
    if (!mentions.length) return item
    const firstSeenAt = item.firstSeenAt
    const newEvidenceIds = union(...mentions.map(row => row.newEvidenceIds))
    const newSourceEventIds = union(...mentions.map(row => row.novelty?.newSourceEventIds))
    const newEconomicFactIds = union(...mentions.map(row => row.novelty?.newEconomicFactIds))
    return { ...item, newEvidenceIds,
      outcome: newEconomicFactIds.length ? '已核验相对基线的经济事实新增，仍不证明超预期、尚未定价或机会兑现'
        : mentions.some(row => row.identityMatch?.matchedId) && (newEvidenceIds.length || newSourceEventIds.length)
          ? '出现新增来源记录，尚未证明经济信息新增或机会兑现' : item.outcome,
      novelty: { ...item.novelty!, newSourceEventIds,
        newEvidenceIds, newEconomicFactIds,
        verifiedEconomicFacts: [...new Map(mentions.flatMap(row => row.novelty?.verifiedEconomicFacts || []).map(fact => [fact.factId, fact])).values()],
        economicStatus: mentions.some(row => row.novelty?.economicStatus === 'verified-new-facts') ? 'verified-new-facts' : item.novelty!.economicStatus },
      forwardObservation: forwardObservation(input.snapshot, firstSeenAt, item.exposure.map(product => product.ticker)) }
  })
}
