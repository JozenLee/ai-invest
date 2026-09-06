import type { Profile } from './contracts'

export type HistoricalReportCandidate = {
  id: string
  industryId: string
  industryName: string
  title: string
  summary: string | null
  dataJson: string | null
  createdAt: Date | string
}

export type HistoricalReportContext = {
  reportId: string
  industryId: string
  industryName: string
  sessionDate: string
  createdAt: string
  title: string
  summary: string
  confidencePct: number | null
  recommendation: unknown
  stateCounts: Record<string, number>
  role: 'historical-context'
}

type ReportData = {
  researchEvaluation?: { expectedSession?: string | null; decisions?: Array<{state?:string}> }
  investmentAdvice?: string | Record<string,unknown>
  reportQuality?: { confidenceScore?: number }
}

const parse = <T,>(value: string | null | undefined): T | null => { try { return JSON.parse(value || 'null') as T } catch { return null } }
const iso = (value: Date | string) => value instanceof Date ? value.toISOString() : new Date(value).toISOString()

function advice(value: ReportData['investmentAdvice']) {
  if (!value) return null
  if (typeof value === 'string') return parse<Record<string,unknown>>(value)
  return value
}

export function reportTradingSession(candidate: HistoricalReportCandidate) {
  const data=parse<ReportData>(candidate.dataJson)
  const session=data?.researchEvaluation?.expectedSession
  return typeof session==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(session)?session:null
}

export function selectHistoricalReports(input:{
  candidates:HistoricalReportCandidate[]
  profile:Profile
  tradingSessions:string[]
  cutoff:string|null
  asOf:string
}):HistoricalReportContext[]{
  const policy=input.profile.historyReports||{enabled:true,lookbackTradingDays:10,mode:'latest-per-trading-day' as const}
  if(!policy.enabled||!input.cutoff)return[]
  const cutoff=input.cutoff
  const sessions=[...new Set(input.tradingSessions.filter(day=>day<=cutoff))].sort().slice(-policy.lookbackTradingDays)
  const allowed=new Set(sessions),latestBySession=new Map<string,HistoricalReportCandidate>()
  for(const candidate of [...input.candidates].sort((a,b)=>iso(b.createdAt).localeCompare(iso(a.createdAt)))){
    if(candidate.industryId!==input.profile.industryId||iso(candidate.createdAt)>input.asOf)continue
    const session=reportTradingSession(candidate)
    if(!session||!allowed.has(session)||latestBySession.has(session))continue
    latestBySession.set(session,candidate)
  }
  return [...latestBySession.entries()].sort(([a],[b])=>a.localeCompare(b)).map(([sessionDate,candidate])=>{
    const data=parse<ReportData>(candidate.dataJson),investment=advice(data?.investmentAdvice)
    const stateCounts=(data?.researchEvaluation?.decisions||[]).reduce<Record<string,number>>((counts,item)=>{const key=item.state||'unknown';counts[key]=(counts[key]||0)+1;return counts},{})
    const confidence=Number(investment?.confidencePct??data?.reportQuality?.confidenceScore)
    return {reportId:candidate.id,industryId:candidate.industryId,industryName:candidate.industryName,sessionDate,createdAt:iso(candidate.createdAt),title:candidate.title,summary:String(candidate.summary||'').slice(0,800),confidencePct:Number.isFinite(confidence)?confidence:null,recommendation:investment?.recommendation||null,stateCounts,role:'historical-context'}
  })
}

export function annotateHistoricalReports(candidates:HistoricalReportCandidate[],included:HistoricalReportContext[],contextIndustryId:string){
  const includedIds=new Set(included.map(item=>item.reportId)),includedSessions=new Set(included.map(item=>item.sessionDate))
  return candidates.map(candidate=>{
    const sessionDate=reportTradingSession(candidate),isIncluded=includedIds.has(candidate.id)
    const inclusionLabel=isIncluded?'纳入下一轮分析':candidate.industryId!==contextIndustryId?'其他产业领域':sessionDate&&includedSessions.has(sessionDate)?'同交易日较早版本':'不在当前回溯窗口'
    return {sessionDate,includedInNextAnalysis:isIncluded,inclusionLabel}
  })
}
