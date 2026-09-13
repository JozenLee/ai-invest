import type { Evidence } from '@/lib/research/contracts'

export type EvidenceClaim = {claim:string;source?:string;date?:string;evidenceIds?:string[];referenceIssues?:string[];referenceCorrections?:string[];references?:Array<{source:string;date:string|null}>}
const identifier=/\b(?:[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}(?::[\w.-]+)*|[a-f0-9]{32,64})\b/gi
export function cleanClaim(text:string){
  return text.replace(identifier,'').replace(/、?:\d{6}/g,'').replace(/^([\u4e00-\u9fff]{2,8})\1(?=投资者|公告)/,'$1').replace(/(?:；?证据[:：]?|〔[\s、]*〕|\[[\s、]*\])(?=[\s、；。]*$)/g,'').replace(/[、；\s]+$/,'').trim()
}
export function auditClaim(row:EvidenceClaim,evidence:Evidence[]):EvidenceClaim{
  if(row.evidenceIds!==undefined&&(!Array.isArray(row.evidenceIds)||row.evidenceIds.some(id=>typeof id!=='string')))throw new Error('智能分析输出字段类型错误：evidenceIds 必须是字符串数组')
  if((row.source!=null&&typeof row.source!=='string')||(row.date!=null&&typeof row.date!=='string'))throw new Error('智能分析输出字段类型错误：source 与 date 必须是字符串')
  const ids=[...new Set([...(row.evidenceIds||[]),...(row.claim.match(identifier)||[])])]
  const issues:string[]=[],corrections:string[]=[...(row.referenceCorrections||[])]
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
  if(/全行业|全池|中位数/.test(row.claim)&&!validIds.some(id=>evidence.find(item=>item.id===id)?.source.startsWith('冻结计算/')))issues.push('聚合统计必须绑定完整冻结计算记录，个别企业证据不能证明全池或环节统计')
  const actualSources=[...new Set(validIds.map(id=>evidence.find(item=>item.id===id)!.source))]
  const namedSources=(row.source||'').split(/[+；;,，]/).flatMap(part=>[part.trim().toLowerCase(),('Tushare/'+part.trim()).toLowerCase()])
  let correctedSource=row.source
  if(row.source&&actualSources.length){
    if(!actualSources.some(source=>namedSources.includes(source.toLowerCase())))issues.push('声明来源与冻结证据来源不匹配：'+row.source+' / '+actualSources.join('；'))
    else if(actualSources.some(source=>!namedSources.includes(source.toLowerCase()))){
      correctedSource=actualSources.join('；')
      corrections.push('多来源显示已按冻结引用补齐为'+correctedSource)
    }
  }
  const uniqueDates=[...new Set(dates)].sort()
  const claimedDate=row.date?.includes('T')?row.date.slice(0,10):row.date
  const mismatched=Boolean(claimedDate&&uniqueDates.length&&!new Set(acceptableDates).has(claimedDate)&&claimedDate!==`${uniqueDates[0]}—${uniqueDates.at(-1)}`)
  const correctedDate=mismatched?(uniqueDates.length===1?uniqueDates[0]:`${uniqueDates[0]}—${uniqueDates.at(-1)}`):claimedDate
  if(mismatched)corrections.push(uniqueDates.length===1?`判断日期已按冻结证据校正为${uniqueDates[0]}`:`多期判断日期已按冻结证据标注为${correctedDate}`)
  const references=[...new Map(validIds.map(id=>{const item=evidence.find(source=>source.id===id)!;const reference={source:item.source,date:item.dataDate||item.publishedAt?.slice(0,10)||null};return [JSON.stringify(reference),reference]})).values()]
  return {...row,source:correctedSource,claim:cleanClaim(row.claim),date:correctedDate,evidenceIds:validIds,references,referenceIssues:[...new Set(issues)],referenceCorrections:[...new Set(corrections)]}
}

/** Re-audit persisted or inherited analysis trees against the evidence frozen for
 * the current run. This removes stale validator noise when review reports reuse
 * narrative produced by an older validator version. */
export function auditEvidenceTree(value:unknown,evidence:Evidence[]):unknown{
  if(typeof value==='string'&&/^[\s]*[\[{]/.test(value)){try{return JSON.stringify(auditEvidenceTree(JSON.parse(value),evidence))}catch{return value}}
  if(Array.isArray(value))return value.map(item=>auditEvidenceTree(item,evidence))
  if(!value||typeof value!=='object')return value
  const row=value as Record<string,unknown>
  if(typeof row.claim==='string')return auditClaim(row as EvidenceClaim,evidence)
  return Object.fromEntries(Object.entries(row).map(([key,item])=>[key,auditEvidenceTree(item,evidence)]))
}
