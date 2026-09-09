import { auditClaim, type EvidenceClaim } from '@/lib/analysis/evidence-references'
import type { Evidence } from '@/lib/research/contracts'
import type { StepContext } from './types'
import type { FrozenGraphContext } from '@/lib/graph/research-context'

const required:Record<string,string[]>={
  'market-analysis':['analysis','trend','risk_level','evidence','counterEvidence','watchlist'],
  'news-analysis':['analysis','sentiment','catalysts','risks','evidence','watchlist'],
  'company-analysis':['analysis','key_companies','chain_structure','evidence','counterEvidence','watchlist'],
  'industry-overview':['analysis','stage','drivers','outlook','evidence','counterEvidence','watchlist'],
  'investment-advice':['rating','executiveSummary','tacticalView','strategicView','thesis','etfImplications','scenarios','counterEvidence','risks','watchlist'],
}
const financialClaim=/营业收入|营收|净利润|现金流|毛利率|净利率|ROE|资产负债率|应收|存货/u

function parseObject(raw:string){
  const clean=raw.trim().replace(/^```(?:json)?\s*/,'').replace(/\s*```$/,'')
  let value:unknown
  try{value=JSON.parse(clean)}catch(original){
    const start=clean.indexOf('{'),end=clean.lastIndexOf('}')
    if(start<0||end<=start)throw original
    value=JSON.parse(clean.slice(start,end+1).replace(/,\s*([}\]])/g,'$1'))
  }
  if(!value||typeof value!=='object'||Array.isArray(value))throw new Error('智能分析输出必须是JSON对象')
  return value as Record<string,unknown>
}

function sanitize(value:unknown,issues:string[]):unknown{
  if(Array.isArray(value))return value.map(item=>sanitize(item,issues))
  if(!value||typeof value!=='object')return value
  const row=Object.fromEntries(Object.entries(value).map(([key,item])=>[key,sanitize(item,issues)]))
  if(typeof row.claim==='string'&&financialClaim.test(row.claim)&&typeof row.source==='string'&&/fund_adj|复权因子/i.test(row.source)){
    row.source=row.source.split(/[；;,，]/).filter(part=>!/fund_adj|复权因子/i.test(part)).join('；').trim()||'公司财报证据（请按证据编号复核）'
    issues.push('已移除不能支持公司财务结论的ETF复权因子来源')
  }
  return row
}

function objectRows(value:unknown){return Array.isArray(value)?value.filter(item=>item&&typeof item==='object'&&!Array.isArray(item)) as Record<string,unknown>[]:[]}
function missingFields(row:Record<string,unknown>,fields:string[]){return fields.filter(field=>!(field in row)||row[field]===null||row[field]==='')}
function validateNestedOutput(value:Record<string,unknown>,key:string,issues:string[]){
  if(key==='company-analysis'){
    for(const [index,row] of objectRows(value.key_companies).entries()){
      const missing=missingFields(row,['code','name','graphPath','selectionReason','mappingConfidence','matchedProducts','operatingEvidence','counterEvidence'])
      if(missing.length)issues.push(`重点企业${index+1}缺少结构化字段：${missing.join('、')}`)
    }
  }
  if(key==='news-analysis'){
    for(const [index,row] of objectRows(value.catalysts).entries()){
      const missing=missingFields(row,['event','path','affectedCompanies','affectedEtfs','conditions','confidence'])
      if(missing.length)issues.push(`催化事件${index+1}缺少传导字段：${missing.join('、')}`)
    }
  }
  if(key==='industry-overview'&&!Array.isArray(value.segmentSignals))issues.push('行业总览缺少按产业环节组织的segmentSignals')
  if(key==='investment-advice'){
    const summary=value.executiveSummary&&typeof value.executiveSummary==='object'&&!Array.isArray(value.executiveSummary)?value.executiveSummary as Record<string,unknown>:{}
    const summaryMissing=missingFields(summary,['conclusion','allocationStance','keyDrivers','opportunities','mainRisks','watchPoints','actionPlan','historyComparison'])
    if(summaryMissing.length)issues.push(`综合结论缺少结构化字段：${summaryMissing.join('、')}`)
    const actionPlan=summary.actionPlan&&typeof summary.actionPlan==='object'&&!Array.isArray(summary.actionPlan)?summary.actionPlan as Record<string,unknown>:{}
    const actionMissing=missingFields(actionPlan,['priority','unheld','held'])
    if(actionMissing.length)issues.push(`建议操作缺少结构化字段：${actionMissing.join('、')}`)
    if(!Array.isArray(value.etfImplications))issues.push('ETF影响必须是逐产品结构化数组')
    for(const [index,row] of objectRows(value.etfImplications).entries()){
      const missing=missingFields(row,['ticker','exposureRationale','segments','companies','evidenceBoundary'])
      if(missing.length)issues.push(`ETF影响${index+1}缺少字段：${missing.join('、')}`)
    }
  }
}

export function validateResearchOutput(raw:string,key:string){
  const value=parseObject(raw),issues:string[]=[]
  const missing=(required[key]||[]).filter(field=>!(field in value))
  if(missing.length)throw new Error(`${key}输出缺少字段：${missing.join('、')}`)
  const sanitized=sanitize(value,issues)
  validateNestedOutput(sanitized as Record<string,unknown>,key,issues)
  return {text:JSON.stringify(sanitized),issues}
}

export function valuationNarrative(products:Array<{indexCode?:string|null;pe?:number|null;pb?:number|null;valuationDate?:string|null;valuationSource?:string|null;pePercentileHistory?:number|null;pbPercentileHistory?:number|null;valuationHistoryStart?:string|null;valuationSampleCount?:number}>){
  const indices=[...new Map(products.filter(item=>Number.isFinite(item.pe)||Number.isFinite(item.pb)).map(item=>[item.indexCode||String(products.indexOf(item)),item])).values()]
  if(!indices.length)return '无可核验指数估值，不判断贵贱。'
  const pes=indices.flatMap(item=>Number.isFinite(item.pe)?[item.pe!]:[]),pbs=indices.flatMap(item=>Number.isFinite(item.pb)?[item.pb!]:[])
  const dates=[...new Set(indices.map(item=>item.valuationDate).filter(Boolean))],sources=[...new Set(indices.map(item=>item.valuationSource).filter(Boolean))]
  const range=(values:number[])=>values.length?`${Math.min(...values).toFixed(2)}—${Math.max(...values).toFixed(2)}`:'缺失'
  const percentiles=indices.flatMap(item=>Number.isFinite(item.pePercentileHistory)||Number.isFinite(item.pbPercentileHistory)?[`${item.indexCode||'指数'}：市盈率分位${Number.isFinite(item.pePercentileHistory)?item.pePercentileHistory!.toFixed(1)+'%':'缺失'}、市净率分位${Number.isFinite(item.pbPercentileHistory)?item.pbPercentileHistory!.toFixed(1)+'%':'缺失'}（${item.valuationHistoryStart||'起始日未知'}起${item.valuationSampleCount||0}期样本）`]:[])
  return `${indices.length}个跟踪指数具备成分穿透估值：市盈率 ${range(pes)}，市净率 ${range(pbs)}；日期${dates.join('、')||'未标注'}，来源${sources.join('、')||'未标注'}。${percentiles.length?`可用历史样本分位：${percentiles.join('；')}。分位仅对应已冻结样本区间，不宣称五年分位。`:'可用历史估值样本不足20期，不判断历史高低。'}`
}

export async function saveValidatedResearchOutput(context:StepContext,key:string,raw:string){
  const result=validateResearchOutput(raw,key)
  const sources=(context.artifacts.get('research-evaluation')?.evidence||context.artifacts.get('research-snapshot')?.evidence||[]) as Evidence[]
  const audit=(value:unknown):unknown=>{
    if(Array.isArray(value))return value.map(audit)
    if(!value||typeof value!=='object')return value
    const row=value as Record<string,unknown>
    if(typeof row.claim==='string'){const checked=auditClaim(row as EvidenceClaim,sources);result.issues.push(...(checked.referenceIssues||[]));return checked}
    return Object.fromEntries(Object.entries(row).map(([field,item])=>[field,audit(item)]))
  }
  result.text=JSON.stringify(audit(JSON.parse(result.text)))
  await context.saveArtifact(key,result.text,'DATA')
  await context.saveArtifact(`${key}-validation`,{status:result.issues.length?'limited':'passed',issues:result.issues},'DATA')
  const graph=(context.artifacts.get('graph-context')||context.artifacts.get('research-snapshot')?.graphContext) as FrozenGraphContext|undefined
  const usageIssues:string[]=[]
  const parsed=JSON.parse(result.text) as Record<string,unknown>
  const serialized=JSON.stringify(parsed)
  if(key==='company-analysis'&&graph?.companyMappings?.some(company=>company.representativeEtfs?.length||company.representativeIndices?.length)){
    if(!Array.isArray(parsed.key_companies)||!serialized.includes('graphPath'))usageIssues.push('重点企业没有保留图谱层级路径')
    if(!serialized.includes('matchedProducts'))usageIssues.push('重点企业没有保留ETF/指数映射')
  }
  if(key==='news-analysis'&&graph?.eventMappings?.length&&(!serialized.includes('affectedEtfs')||!serialized.includes('path')))usageIssues.push('资讯结论没有保留事件到ETF的图谱传导路径')
  if(key==='industry-overview'&&graph?.stages?.length&&!Array.isArray(parsed.segmentSignals))usageIssues.push('行业总览没有按图谱环节输出信号')
  if(key==='investment-advice'&&graph?.etfExposure?.length&&(!Array.isArray(parsed.etfImplications)||!serialized.includes('exposureRationale')))usageIssues.push('投资建议没有逐ETF说明产业暴露依据')
  await context.saveArtifact(`${key}-graph-usage-validation`,{status:usageIssues.length?'limited':'passed',issues:usageIssues,structureRevisionId:graph?.revisionId||null,mappingRevisionId:graph?.mappingRevisionId||null},'DATA')
  return result.text
}
