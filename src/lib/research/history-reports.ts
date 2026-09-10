import type { ResearchOpportunity } from '@/lib/analysis/opportunity-ledger'
import type { Profile } from './contracts'
import { normalizeExecutiveConclusion, type ExecutiveInvestmentConclusion } from '@/lib/analysis/investment-conclusion'

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
  comprehensiveConclusion: ExecutiveInvestmentConclusion
  opportunityLedger?: ResearchOpportunity[]
  role: 'historical-comprehensive-conclusion'
}

type ReportData = {
  opportunityLedger?: ResearchOpportunity[]
  researchEvaluation?: { expectedSession?: string | null; decisions?: Array<{state?:string}> }
  investmentAdvice?: string | Record<string,unknown>
  metadata?: { verificationMode?: string | null }
}

const parse = <T,>(value: string | null | undefined): T | null => { try { return JSON.parse(value || 'null') as T } catch { return null } }
const iso = (value: Date | string) => value instanceof Date ? value.toISOString() : new Date(value).toISOString()

export function isVerificationReport(candidate: Pick<HistoricalReportCandidate, 'dataJson'>) {
  return parse<ReportData>(candidate.dataJson)?.metadata?.verificationMode === 'graph-e2e'
}

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
    if(candidate.industryId!==input.profile.industryId||iso(candidate.createdAt)>input.asOf||isVerificationReport(candidate))continue
    const session=reportTradingSession(candidate)
    if(!session||!allowed.has(session)||latestBySession.has(session))continue
    latestBySession.set(session,candidate)
  }
  return [...latestBySession.entries()].sort(([a],[b])=>a.localeCompare(b)).map(([sessionDate,candidate])=>{
    const data=parse<ReportData>(candidate.dataJson),investment=advice(data?.investmentAdvice)
    return {reportId:candidate.id,industryId:candidate.industryId,industryName:candidate.industryName,sessionDate,createdAt:iso(candidate.createdAt),title:candidate.title,opportunityLedger:data?.opportunityLedger,comprehensiveConclusion:normalizeExecutiveConclusion(investment,String(candidate.summary||'').slice(0,800)),role:'historical-comprehensive-conclusion'}
  })
}

export function annotateHistoricalReports(candidates:HistoricalReportCandidate[],included:HistoricalReportContext[],contextIndustryId:string){
  const includedIds=new Set(included.map(item=>item.reportId)),includedSessions=new Set(included.map(item=>item.sessionDate))
  return candidates.map(candidate=>{
    const sessionDate=reportTradingSession(candidate),isIncluded=includedIds.has(candidate.id)
    const inclusionLabel=isVerificationReport(candidate)?'链路验证报告，不纳入分析':isIncluded?'纳入下一轮分析':candidate.industryId!==contextIndustryId?'其他产业领域':sessionDate&&includedSessions.has(sessionDate)?'同交易日较早版本':'不在当前回溯窗口'
    return {sessionDate,includedInNextAnalysis:isIncluded,inclusionLabel}
  })
}
