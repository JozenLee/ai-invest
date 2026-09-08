import { administrativeTitle } from './event-policy'
import { createHash } from 'node:crypto'
import type { EventInput, ResearchEvent } from './contracts'
import { visibleAt } from './time'
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
export function clusterEvents(rows: EventInput[], asOf: string): ResearchEvent[] {
  const groups = new Map<string, EventInput[]>()
  for (const row of rows.filter(r=>r.title.trim() && r.source && visibleAt(r.publishedAt,r.fetchedAt,asOf))) {
    const key = eventKey(row); groups.set(key, [...(groups.get(key) || []), row])
  }
  return [...groups].map(([key, group]): ResearchEvent => {
    group.sort((a,b)=>b.content.length-a.content.length || a.id.localeCompare(b.id))
    const row = group[0], body = row.content.replace(/<[^>]*>/g,' ').replace(/\s+/g,' ').trim()
    const titleCategory = categories.find(([,pattern])=>pattern.test(row.title))
    // Governance notices stay excluded; otherwise the body can establish the
    // event type even when the headline says only ‘最新部署’ or ‘周报’.
    const [category,,priority,days] = titleCategory&&titleCategory[0]!=='technology' ? titleCategory : categories.slice(1).find(([,pattern])=>pattern.test(row.title+' '+body.slice(0,6000))) || ['other', /./, 2, 14] as const
    const substantial = body.replace(/\s/g,'').length >= (row.kind === 'announcement' ? 80 : 40) && body !== row.title && !/上游未提供|正文缺失/.test(body)
    // Select relevant sentences instead of chopping the document's legal boilerplate.
    const sentences = body.split(/(?<=[。！？；\n])/).filter(s=>s.trim())
    const selected = sentences.filter(s=>/营收|利润|现金流|订单|产能|资本开支|同比|环比|管制|库存|应收|部署|政策|芯片|模型|算力|GPU|液冷/i.test(s) && !/参与单位|人员姓名|排名不分|联系电话|不构成.*承诺/.test(s))
    return { id: 'event-' + createHash('sha256').update(key).digest('hex').slice(0,20), title:row.title, category, publishedAt:row.publishedAt,
      expiresAt:new Date(Date.parse(row.publishedAt) + days * 86400000).toISOString(), companies:[...new Set(group.flatMap(r=>r.company?[r.company]:[]))], segments:[...new Set(group.flatMap(r=>r.segments || []))],
      evidenceIds:group.map(r=>r.id), sources:[...new Set(group.map(r=>r.source))], urls:[...new Set(group.flatMap(r=>r.url?[r.url]:[]))], excerpt:(selected.length?selected:sentences).join(' ').slice(0,1200),
      status:substantial?'evidence':'lead', priority, verification:'source-linked-not-independently-verified' }
  }).filter(e=>Date.parse(e.expiresAt)>Date.parse(asOf)).sort((a,b)=>b.priority-a.priority || Number(b.status==='evidence')-Number(a.status==='evidence') || b.publishedAt.localeCompare(a.publishedAt) || a.id.localeCompare(b.id))
}
