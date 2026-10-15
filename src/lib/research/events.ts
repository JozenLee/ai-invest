import { administrativeTitle, digestTitle, lowDecisionValueTitle, nonMaterialRiskTitle } from './event-policy'
import { createHash } from 'node:crypto'
import type { EventInput, ResearchEvent } from './contracts'
import { visibleAt } from './time'

export type EventSentimentSummary = {
  totalEvents: number
  evidenceEvents: number
  leadEvents: number
  announcementEvents: number
  positive: number
  negative: number
  neutral: number
  score: number | null
  avgSentiment: number | null
  developmentTone: '积极' | '中性' | '消极' | '未知'
  latestPublishedAt: string | null
  freshness: '当前' | '过期' | '未知'
  method: string
}

const positiveEvent=/增长|增加|上调|中标|订单|扩产|投产|获批|突破|量产|供货|盈利|扭亏|增持|合作|落地|建成|升级|需求增长|涨价/
const negativeEvent=/下降|减少|下调|亏损|违约|立案|处罚|禁令|终止|减持|尚未形成收入|澄清.{0,12}未|走低|下跌|回调|延期|延迟|停产/

/** Deterministic event tone is an auditable prior for the AI narrative, not a
 * substitute for causal analysis. Source quality, materiality and recency all
 * affect the score; leads remain visible but never vote. */
export function summarizeEventSentiment(events: ResearchEvent[], asOf: string): EventSentimentSummary {
  const evidence=events.filter(event=>event.status==='evidence'&&event.category!=='administrative')
  let weighted=0,totalWeight=0,positive=0,negative=0,neutral=0
  for(const event of evidence){
    const text=`${event.title} ${event.excerpt}`
    const hasPositive=positiveEvent.test(text),hasNegative=negativeEvent.test(text)
    const direction=hasPositive&&!hasNegative?1:hasNegative&&!hasPositive?-1:0
    if(direction>0)positive+=1
    else if(direction<0)negative+=1
    else neutral+=1
    const gradeWeight={A:1,B:.85,C:.65,D:.25}[event.evidenceGrade||'C']
    const sourceWeight=event.sourceTier==='primary'?1.1:event.sourceTier==='corroborated'?1:event.sourceTier==='secondary'?0.85:0.5
    const materiality=.5+.5*Math.max(0,Math.min(100,event.materialityScore??50))/100
    const ageDays=Math.max(0,(Date.parse(asOf)-Date.parse(event.publishedAt))/86_400_000)
    const recency=Math.pow(.5,ageDays/30)
    const weight=gradeWeight*sourceWeight*materiality*recency
    weighted+=direction*weight;totalWeight+=weight
  }
  const score=totalWeight?Math.round(weighted/totalWeight*1000)/1000:null
  const latestPublishedAt=evidence.map(event=>event.publishedAt).sort().at(-1)||null
  const latestAgeHours=latestPublishedAt?(Date.parse(asOf)-Date.parse(latestPublishedAt))/3_600_000:Infinity
  return {
    totalEvents:events.length,evidenceEvents:evidence.length,leadEvents:events.filter(event=>event.status==='lead').length,
    announcementEvents:evidence.filter(event=>event.companies.length>0).length,
    positive,negative,neutral,score,avgSentiment:score,
    developmentTone:score===null?'未知':score>.15?'积极':score<-.15?'消极':'中性',
    latestPublishedAt,freshness:!latestPublishedAt?'未知':latestAgeHours<=48?'当前':'过期',
    method:'仅对有正文、非行政类事件计分；按证据等级、来源层级、材料性与30日半衰期加权。该分数是可审计的事件语气先验，不等同于业绩、资金流或投资建议。',
  }
}
const categories: Array<[ResearchEvent['category'], RegExp, number, number]> = [
  ['administrative', administrativeTitle, 0, 7],
  ['risk', /违约|立案|处罚|出口管制|禁令|下修|下调业绩|终止重大|亏损预警/, 5, 30],
  ['earnings', /业绩|年度报告|半年度报告|季度报告|营收|利润|现金流|盈利/, 4, 90],
  ['demand', /订单|中标|扩产|资本开支|产能|交付|采购|出货|库存|调研|投资者关系活动记录/, 4, 30],
  ['policy', /产业政策|条例|国务院|工信部|财政部|证监会|监管政策|部门.*部署|国资委|行动方案|指导意见/, 4, 90],
  ['technology', /芯片|模型|算力|光模块|液冷|互连|服务器|GPU|推理|训练/i, 4, 30],
]
export function eventKey(row: EventInput) {
  // Remove company prefix and publisher boilerplate, not numbers (different orders are different events).
  const title = row.title.replace(/^[^:：]{1,20}[:：]/, '').replace(/【[^】]*】/g, '').replace(/[\s\p{P}]/gu, '').toLowerCase()
  return `${row.kind}:${row.company || ''}:${row.publishedAt.slice(0,10)}:${title}`
}

function normalizedTitle(value:string){
  return value.replace(/^[^:：]{1,20}[:：]/, '').replace(/【[^】]*】/g, '').replace(/相关市场|相关传闻|市场传闻|相关/g,'').replace(/[“”"'《》\s\p{P}]/gu, '').toLowerCase()
}
function titleSimilarity(a:string,b:string){
  const grams=(value:string)=>new Set(Array.from({length:Math.max(1,value.length-1)},(_,index)=>value.slice(index,index+2)))
  const left=grams(normalizedTitle(a)),right=grams(normalizedTitle(b))
  const overlap=[...left].filter(token=>right.has(token)).length
  return 2*overlap/Math.max(1,left.size+right.size)
}
function compatibleEvents(a:EventInput,b:EventInput){
  if(a.publishedAt.slice(0,10)!==b.publishedAt.slice(0,10))return false
  if(a.company&&b.company&&a.company!==b.company)return false
  const segmentsA=new Set(a.segments||[]),segmentsB=b.segments||[]
  const related=!segmentsA.size||!segmentsB.length||segmentsB.some(segment=>segmentsA.has(segment))
  return related&&titleSimilarity(a.title,b.title)>=.58
}
function sourceClass(source:string,kind:EventInput['kind']){
  if(kind==='announcement'||/stock_announcement|公司公告|交易所|证监会|工信部|国务院|财政部|国资委|cninfo/i.test(source))return 'primary' as const
  return 'secondary' as const
}
function bounded(value:number,min=0,max=100){return Math.max(min,Math.min(max,value))}

/** Influence is deliberately separate from evidence quality: a widely discussed
 * item can be influential but weakly verified. Provider impact and graph
 * propagation are used when available; source and industry breadth provide an
 * auditable fallback for announcements and older records. */
function eventInfluence(group:EventInput[],materialityScore:number){
  const providerValues=group.map(item=>item.impact).filter((value):value is number=>typeof value==='number'&&Number.isFinite(value))
  const providerImpact=providerValues.length?bounded(Math.max(...providerValues),1,5):null
  const propagationValues=group.map(item=>item.propagationImpact).filter((value):value is number=>typeof value==='number'&&Number.isFinite(value))
  const propagationImpact=propagationValues.length?Math.max(...propagationValues.map(value=>Math.abs(value))):null
  const sourceBreadth=bounded(new Set(group.map(item=>item.source)).size*20)
  const industryBreadth=bounded(new Set(group.flatMap(item=>item.segments||[])).size*18+new Set(group.flatMap(item=>item.company?[item.company]:[])).size*8)
  const explicit=providerImpact===null?materialityScore:(providerImpact/5)*100
  const propagation=propagationImpact===null?materialityScore:bounded(propagationImpact*100)
  const influenceScore=Math.round(explicit*.4+propagation*.2+materialityScore*.2+sourceBreadth*.1+industryBreadth*.1)
  return {influenceScore,influenceLevel:influenceScore>=75?'high' as const:influenceScore>=55?'medium' as const:'low' as const,
    influenceFactors:{providerImpact,propagationImpact,sourceBreadth,industryBreadth}}
}

function evidenceQuality(group:EventInput[],substantial:boolean,category:ResearchEvent['category'],priority:number,title:string,body:string){
  const sourceIdentity=(source:string)=>/stock_announcement|eastmoney_direct|公司公告|cninfo/i.test(source)?'company-filing':source.replace(/^Tushare\//,'').replace(/金融数据聚合服务[（(]?|[）)]/g,'')
  // Identical syndicated text is one observation even when distributed by
  // several providers. Preserve all channels in sources for provenance.
  const bodies=new Map<string,string>()
  const independentSources=new Set(group.map(item=>{
    const body=item.content.replace(/<[^>]*>/g,'').replace(/[\s\p{P}]/gu,'').toLowerCase()
    const origin=body.length>=40?bodies.get(body):undefined
    const identity=origin||sourceIdentity(item.source)
    if(body.length>=40)bodies.set(body,identity)
    return identity
  }))
  const primary=group.some(item=>sourceClass(item.source,item.kind)==='primary')
  const corroborated=independentSources.size>=2
  const generic=digestTitle.test(title)
  const nonMaterialRisk=nonMaterialRiskTitle.test(title)
  const lowDecisionValue=lowDecisionValueTitle.test(title)
  const numeric=/\d+(?:\.\d+)?%|\d+(?:\.\d+)?(?:亿|万|元|台|片|份|EFLOPS)/i.test(body)
  const mapped=group.some(item=>item.company||(item.segments||[]).length)
  const score=Math.max(0,Math.min(100,priority*10+(primary?20:corroborated?12:4)+(numeric?8:0)+(mapped?8:0)+(substantial?8:0)-(generic?28:0)-(nonMaterialRisk?30:0)-(lowDecisionValue?35:0)-(category==='administrative'?60:0)))
  const sourceTier:NonNullable<ResearchEvent['sourceTier']>=!substantial?'lead':primary?'primary':corroborated?'corroborated':'secondary'
  const grade=!substantial||score<45?'D':primary&&score>=75?'A':(corroborated||score>=70)?'B':'C'
  return {evidenceGrade:grade as ResearchEvent['evidenceGrade'],sourceTier,independentSourceCount:independentSources.size,materialityScore:score,...eventInfluence(group,score)}
}
export function clusterEvents(rows: EventInput[], asOf: string): ResearchEvent[] {
  const groups = new Map<string, EventInput[]>()
  for (const row of rows.filter(r=>r.title.trim() && r.source && visibleAt(r.publishedAt,r.fetchedAt,asOf))) {
    const exact=eventKey(row)
    const fuzzy=[...groups.entries()].find(([,group])=>compatibleEvents(group[0],row))?.[0]
    const key=fuzzy||exact; groups.set(key, [...(groups.get(key) || []), row])
  }
  return [...groups].map(([key, group]): ResearchEvent => {
    group.sort((a,b)=>b.content.length-a.content.length || a.id.localeCompare(b.id))
    const row = group[0], body = row.content.replace(/<[^>]*>/g,' ').replace(/\s+/g,' ').trim()
    const titleCategory = nonMaterialRiskTitle.test(row.title) ? undefined : categories.find(([,pattern])=>pattern.test(row.title))
    // Governance notices stay excluded; otherwise the body can establish the
    // event type even when the headline says only ‘最新部署’ or ‘周报’.
    const [category,,priority,days] = nonMaterialRiskTitle.test(row.title) ? ['other',/./,2,7] as const : titleCategory&&titleCategory[0]!=='technology' ? titleCategory : categories.slice(1).find(([,pattern])=>pattern.test(row.title+' '+body.slice(0,6000))) || ['other', /./, 2, 14] as const
    const substantial = body.replace(/\s/g,'').length >= (row.kind === 'announcement' ? 80 : 40) && body !== row.title && !/上游未提供|正文缺失/.test(body)
    // Select relevant sentences instead of chopping the document's legal boilerplate.
    const sentences = body.split(/(?<=[。！？；\n])/).filter(s=>s.trim())
    const selected = sentences.filter(s=>/营收|利润|现金流|订单|产能|资本开支|同比|环比|管制|库存|应收|部署|政策|芯片|模型|算力|GPU|液冷/i.test(s) && !/参与单位|人员姓名|排名不分|联系电话|不构成.*承诺/.test(s))
    const quality=evidenceQuality(group,substantial,category,priority,row.title,body)
    return { id: 'event-' + createHash('sha256').update(key).digest('hex').slice(0,20), title:row.title, category, publishedAt:row.publishedAt,
      expiresAt:new Date(Date.parse(row.publishedAt) + days * 86400000).toISOString(), companies:[...new Set(group.flatMap(r=>r.company?[r.company]:[]))], segments:[...new Set(group.flatMap(r=>r.segments || []))],
      evidenceIds:group.map(r=>r.id), sources:[...new Set(group.map(r=>r.source))], urls:[...new Set(group.flatMap(r=>r.url?[r.url]:[]))], excerpt:(selected.length?selected:sentences).join(' ').slice(0,1200),
      status:substantial?'evidence':'lead', priority, verification:'source-linked-not-independently-verified',...quality }
  }).filter(e=>Date.parse(e.expiresAt)>Date.parse(asOf)).sort((a,b)=>(b.influenceScore||0)-(a.influenceScore||0)||b.priority-a.priority || Number(b.status==='evidence')-Number(a.status==='evidence') || b.publishedAt.localeCompare(a.publishedAt) || a.id.localeCompare(b.id))
}
