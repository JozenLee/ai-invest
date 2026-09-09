import type { Evidence } from '@/lib/research/contracts'

export type EvidenceClaim = {claim:string;source?:string;date?:string;evidenceIds?:string[];referenceIssues?:string[]}
const identifier=/\b(?:[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}(?::[\w.-]+)*|[a-f0-9]{32,64})\b/gi
export function cleanClaim(text:string){
  return text.replace(identifier,'').replace(/、?:\d{6}/g,'').replace(/^([\u4e00-\u9fff]{2,8})\1(?=投资者|公告)/,'$1').replace(/(?:；?证据[:：]?|〔[\s、]*〕|\[[\s、]*\])(?=[\s、；。]*$)/g,'').replace(/[、；\s]+$/,'').trim()
}
export function auditClaim(row:EvidenceClaim,evidence:Evidence[]):EvidenceClaim{
  const ids=[...new Set([...(row.evidenceIds||[]),...(row.claim.match(identifier)||[])])]
  const issues:string[]=[]
  if(!ids.length)issues.push('未绑定冻结证据编号，仅作待核验文字')
  const validIds:string[]=[]
  const dates:string[]=[]
  const acceptableDates:string[]=[]
  for(const id of ids){
    const source=evidence.find(item=>item.id===id)
    if(!source){issues.push(`已移除不在本轮证据包的引用${id.slice(-8)}`);continue}
    validIds.push(id)
    const date=source.dataDate||source.publishedAt?.slice(0,10)
    if(date)dates.push(date)
    if(source.dataDate)acceptableDates.push(source.dataDate)
    if(source.publishedAt)acceptableDates.push(source.publishedAt.slice(0,10))
    if(row.source&&/fund_adj|复权因子/i.test(row.source)&&/利润|营收|现金流|均线|相对|波动|回撤/.test(row.claim)&&!source.source.includes('fund_daily')&&!source.source.includes('research-bundle'))issues.push('复权因子不能独立证明该数值，应绑定实际计算序列')
  }
  const uniqueDates=[...new Set(dates)].sort()
  const claimedDate=row.date?.slice(0,10)
  const mismatched=Boolean(claimedDate&&uniqueDates.length&&!new Set(acceptableDates).has(claimedDate))
  const correctedDate=mismatched?(uniqueDates.length===1?uniqueDates[0]:`${uniqueDates[0]}—${uniqueDates.at(-1)}`):claimedDate
  if(mismatched)issues.push(uniqueDates.length===1?`判断日期已按冻结证据校正为${uniqueDates[0]}`:`多期判断日期已按冻结证据标注为${correctedDate}`)
  return {...row,claim:cleanClaim(row.claim),date:correctedDate,evidenceIds:validIds,referenceIssues:[...new Set(issues)]}
}

/** Re-audit persisted or inherited analysis trees against the evidence frozen for
 * the current run. This removes stale validator noise when review reports reuse
 * narrative produced by an older validator version. */
export function auditEvidenceTree(value:unknown,evidence:Evidence[]):unknown{
  if(Array.isArray(value))return value.map(item=>auditEvidenceTree(item,evidence))
  if(!value||typeof value!=='object')return value
  const row=value as Record<string,unknown>
  if(typeof row.claim==='string')return auditClaim(row as EvidenceClaim,evidence)
  return Object.fromEntries(Object.entries(row).map(([key,item])=>[key,auditEvidenceTree(item,evidence)]))
}
