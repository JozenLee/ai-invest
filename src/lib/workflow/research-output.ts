import type { StepContext } from './types'

const required:Record<string,string[]>={
  'market-analysis':['analysis','trend','risk_level','evidence','counterEvidence','watchlist'],
  'news-analysis':['analysis','sentiment','catalysts','risks','evidence','watchlist'],
  'company-analysis':['analysis','key_companies','chain_structure','evidence','counterEvidence','watchlist'],
  'industry-overview':['analysis','stage','drivers','outlook','evidence','counterEvidence','watchlist'],
  'investment-advice':['rating','tacticalView','strategicView','thesis','etfImplications','scenarios','counterEvidence','risks','watchlist'],
}
const financialClaim=/营业收入|营收|净利润|现金流|毛利率|净利率|ROE|资产负债率|应收|存货/u

function parseObject(raw:string){
  const clean=raw.trim().replace(/^```(?:json)?\s*/,'').replace(/\s*```$/,'')
  const value=JSON.parse(clean)
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

export function validateResearchOutput(raw:string,key:string){
  const value=parseObject(raw),issues:string[]=[]
  const missing=(required[key]||[]).filter(field=>!(field in value))
  if(missing.length)throw new Error(`${key}输出缺少字段：${missing.join('、')}`)
  const sanitized=sanitize(value,issues)
  return {text:JSON.stringify(sanitized),issues}
}

export function valuationNarrative(products:Array<{indexCode?:string|null;pe?:number|null;pb?:number|null;valuationDate?:string|null;valuationSource?:string|null}>){
  const indices=[...new Map(products.filter(item=>Number.isFinite(item.pe)||Number.isFinite(item.pb)).map(item=>[item.indexCode||String(products.indexOf(item)),item])).values()]
  if(!indices.length)return '无可核验指数估值，不判断贵贱。'
  const pes=indices.flatMap(item=>Number.isFinite(item.pe)?[item.pe!]:[]),pbs=indices.flatMap(item=>Number.isFinite(item.pb)?[item.pb!]:[])
  const dates=[...new Set(indices.map(item=>item.valuationDate).filter(Boolean))],sources=[...new Set(indices.map(item=>item.valuationSource).filter(Boolean))]
  const range=(values:number[])=>values.length?`${Math.min(...values).toFixed(2)}—${Math.max(...values).toFixed(2)}`:'缺失'
  return `${indices.length}个跟踪指数具备成分穿透估值：PE ${range(pes)}，PB ${range(pbs)}；日期${dates.join('、')||'未标注'}，来源${sources.join(' / ')||'未标注'}。历史分位样本不足时不作高低判断。`
}

export async function saveValidatedResearchOutput(context:StepContext,key:string,raw:string){
  const result=validateResearchOutput(raw,key)
  await context.saveArtifact(key,result.text,'DATA')
  await context.saveArtifact(`${key}-validation`,{status:'passed',issues:result.issues},'DATA')
  return result.text
}
