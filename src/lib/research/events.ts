import { createHash } from 'node:crypto'
import type { EventInput, ResearchEvent } from './contracts'
import { visibleAt } from './time'
const categories: Array<[ResearchEvent['category'], RegExp, number, number]> = [
  ['administrative', /登记|股东会|股东大会|过户|翌日披露|章程|工商变更|会议材料|管理制度|内部控制|董事会成员|员工多元化|对外投资与担保|最近五年不存在|转股价格修正|关于召开.*说明会|关于参加.*说明会|业绩说明会的公告/, 0, 7],
  ['risk', /违约|立案|处罚|出口管制|禁令|下修|下调业绩|终止重大|亏损预警/, 5, 30],
  ['earnings', /业绩|年度报告|半年度报告|季度报告|营收|利润|现金流|盈利/, 4, 90],
  ['demand', /订单|中标|扩产|资本开支|产能|交付|采购|出货|库存|调研|投资者关系活动记录/, 4, 30],
  ['policy', /产业政策|条例|国务院|工信部|财政部|证监会|监管政策/, 4, 90],
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
    const [category,,priority,days] = categories.find(([,pattern])=>pattern.test(row.title)) || ['other', /./, 1, 7] as const
    const substantial = body.replace(/\s/g,'').length >= (row.kind === 'announcement' ? 80 : 40) && body !== row.title && !/上游未提供|正文缺失/.test(body)
    // Select relevant sentences instead of chopping the document's legal boilerplate.
    const sentences = body.split(/(?<=[。！？；\n])/).filter(s=>s.trim())
    const selected = sentences.filter(s=>/营收|利润|现金流|订单|产能|资本开支|同比|环比|风险|管制|库存|应收/.test(s))
    return { id: 'event-' + createHash('sha256').update(key).digest('hex').slice(0,20), title:row.title, category, publishedAt:row.publishedAt,
      expiresAt:new Date(Date.parse(row.publishedAt) + days * 86400000).toISOString(), companies:[...new Set(group.flatMap(r=>r.company?[r.company]:[]))], segments:[...new Set(group.flatMap(r=>r.segments || []))],
      evidenceIds:group.map(r=>r.id), sources:[...new Set(group.map(r=>r.source))], urls:[...new Set(group.flatMap(r=>r.url?[r.url]:[]))], excerpt:(selected.length?selected:sentences).join(' ').slice(0,1200),
      status:substantial?'evidence':'lead', priority, verification:'source-linked-not-independently-verified' }
  }).filter(e=>Date.parse(e.expiresAt)>Date.parse(asOf)).sort((a,b)=>b.priority-a.priority || Number(b.status==='evidence')-Number(a.status==='evidence') || b.publishedAt.localeCompare(a.publishedAt) || a.id.localeCompare(b.id))
}
