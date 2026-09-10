import type { FrozenGraphContext } from '@/lib/graph/research-context'
import { cleanClaim } from '@/lib/analysis/evidence-references'

const record = (value: unknown): Record<string, unknown> => {
  if (value && typeof value === 'object' && !Array.isArray(value)) return value as Record<string, unknown>
  try {
    const parsed = JSON.parse(String(value || '{}'))
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed as Record<string, unknown> : {}
  } catch { return {} }
}

const normalizedSecurityCode=(value:unknown)=>String(value||'').trim().replace(/^(?:sh|sz)/i,'').replace(/\.(?:SH|SZ)$/i,'')

/** Refresh paths inherited by rules-only reviews against the current frozen graph.
 * The graph keeps only the highest-priority event mappings, so older catalysts also
 * need a company -> segment -> ETF fallback instead of being labelled unmapped. */
export function refreshEventPaths(value:unknown,graph?:FrozenGraphContext){
  const analysis=record(value)
  if(!graph||!Array.isArray(analysis.catalysts))return value
  const catalysts=analysis.catalysts.map(item=>{
    const row=record(item),title=String(row.event||row.title||''),mapping=graph.eventMappings.find(candidate=>candidate.title===title)
    const path=mapping?.paths?.[0]
    if(path)return {...row,path:`冻结事件 → ${path.segmentNames.join(' → ')} → 相关指数基金（方向待复核）`,affectedCompanies:Array.isArray(row.affectedCompanies)?row.affectedCompanies:path.affectedCompanies,graphAffectedCompanies:path.affectedCompanies,affectedEtfs:path.affectedEtfs}

    const catalystCompanies=Array.isArray(row.affectedCompanies)?row.affectedCompanies.map(normalizedSecurityCode).filter(Boolean):[]
    const companyMappings=graph.companyMappings.filter(company=>catalystCompanies.includes(normalizedSecurityCode(company.code))&&company.segmentCode)
    const segmentCodes=[...new Set([...(mapping?.directSegments||[]),...companyMappings.flatMap(company=>company.segmentCode?[company.segmentCode]:[])])]
    const segmentNames=[...new Set([...(mapping?.directSegmentNames||[]),...companyMappings.flatMap(company=>company.segment?[company.segment]:[])])]
    if(!segmentCodes.length||!segmentNames.length)return item
    const affectedEtfs=graph.etfExposure.filter(etf=>etf.segments.some(segment=>segmentCodes.includes(segment.segmentCode)||segment.matchedCompanies.some(code=>catalystCompanies.includes(normalizedSecurityCode(code))))).map(etf=>etf.code)
    return {...row,path:`冻结事件 → ${segmentNames.join(' → ')} → 相关指数基金（方向待复核）`,affectedCompanies:catalystCompanies,affectedEtfs:[...new Set(affectedEtfs)]}
  })
  const evidence=Array.isArray(analysis.evidence)?analysis.evidence.map(item=>{
    const row=record(item),date=typeof row.date==='string'?row.date.slice(0,10):row.date
    const referenceIssues=Array.isArray(row.referenceIssues)?row.referenceIssues.filter(issue=>{
      if(typeof issue!=='string')return true
      const match=issue.match(/日期为(\d{4}-\d{2}-\d{2})，与判断日期(\d{4}-\d{2}-\d{2})/)
      return !match||match[1]!==match[2]
    }):row.referenceIssues
    return {...row,claim:typeof row.claim==='string'?cleanClaim(row.claim):row.claim,date,referenceIssues}
  }):analysis.evidence
  return {...analysis,catalysts,evidence}
}
