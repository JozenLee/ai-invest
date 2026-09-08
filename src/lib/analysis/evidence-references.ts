import type { Evidence } from '@/lib/research/contracts'

export type EvidenceClaim = {claim:string;source?:string;date?:string;evidenceIds?:string[];referenceIssues?:string[]}
const identifier=/\b(?:[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}(?::[\w.-]+)*|[a-f0-9]{32,64})\b/gi
export function cleanClaim(text:string){
  return text.replace(identifier,'').replace(/、?:\d{6}/g,'').replace(/(?:；?证据[:：]?|〔[\s、]*〕|\[[\s、]*\])(?=[\s、；。]*$)/g,'').replace(/[、；\s]+$/,'').trim()
}
export function auditClaim(row:EvidenceClaim,evidence:Evidence[]):EvidenceClaim{
  const ids=[...new Set([...(row.evidenceIds||[]),...(row.claim.match(identifier)||[])])]
  const issues:string[]=[]
  if(!ids.length)issues.push('未绑定冻结证据编号，仅作待核验文字')
  for(const id of ids){
    const source=evidence.find(item=>item.id===id)
    if(!source){issues.push(`引用${id.slice(-8)}不在本轮证据包`);continue}
    const date=source.dataDate||source.publishedAt?.slice(0,10)
    if(row.date&&date&&row.date!==date&&row.date!==source.publishedAt?.slice(0,10))issues.push(`引用${id.slice(-8)}日期为${date}，与判断日期${row.date}不同`)
    if(row.source&&/fund_adj|复权因子/i.test(row.source)&&/利润|营收|现金流|均线|相对|波动|回撤/.test(row.claim)&&!source.source.includes('fund_daily')&&!source.source.includes('research-bundle'))issues.push('复权因子不能独立证明该数值，应绑定实际计算序列')
  }
  return {...row,claim:cleanClaim(row.claim),evidenceIds:ids,referenceIssues:[...new Set(issues)]}
}
