'use client'

import { useState } from 'react'
import { administrativeTitle } from '@/lib/research/event-policy'
import type { Evaluation } from '@/lib/research/contracts'
import { decisionEvents } from '@/lib/analysis/report-insights'
import { chineseSource } from '@/lib/analysis/chinese-labels'
import { Button } from '@/components/ui/button'

type Mode = 'related' | 'appendix'

export function ReportEvidenceView({ evaluation, baseUrl, mode = 'appendix' }: { evaluation?: Evaluation; baseUrl: string; mode?: Mode }) {
  const [scope, setScope] = useState('all')
  const [limit, setLimit] = useState(mode === 'related' ? 6 : 12)
  const [sourceLimit, setSourceLimit] = useState(30)
  const all = evaluation?.events || []
  const selected = decisionEvents(evaluation, mode === 'related' ? 24 : Number.MAX_SAFE_INTEGER)
  const rows = mode === 'related' ? selected : scope === 'decision' ? selected : scope === 'lead' ? all.filter(item => item.status === 'lead') : all
  const heading = mode === 'related' ? '关键事件依据' : '来源与冻结数据目录'
  const description = mode === 'related'
    ? `以下 ${selected.length} 项冻结事件进入了本轮事件分析输入，与上方事件结论共同阅读；线索和一般事件不在此处干扰判断。`
    : `冻结事件 ${all.length} 项 · 决策事件 ${selected.length} 项。这里保留完整来源、线索与冻结记录，用于复盘核对，不补入冻结时点后的材料。`

  return <section id={mode === 'related' ? 'related-events' : 'evidence'} className="scroll-mt-20 space-y-4">
    <h2 className={mode === 'related' ? 'text-lg font-semibold' : 'text-xl font-semibold'}>{heading}</h2>
    <p className="text-sm leading-6 text-muted-foreground">{description}</p>
    {mode === 'appendix' && <div className="flex flex-wrap gap-2">{[['all', '全部冻结事件'], ['decision', '决策事件'], ['lead', '待核验线索']].map(([key, label]) => <Button key={key} size="sm" variant={scope === key ? 'default' : 'outline'} onClick={() => { setScope(key); setLimit(12) }}>{label}</Button>)}</div>}
    <p className="text-xs text-muted-foreground">显示 {Math.min(limit, rows.length)} / {rows.length} 项</p>
    <div className="grid gap-3 lg:grid-cols-2">{rows.slice(0, limit).map(event => <article key={event.id} className="min-w-0 rounded-xl border bg-card p-4 [overflow-wrap:anywhere]">
      <h3 className="text-sm font-semibold leading-6">{event.title}</h3>
      <p className="mt-1 text-xs text-muted-foreground">{event.publishedAt.slice(0, 10)} · {event.sources.map(chineseSource).join('、')}</p>
      <p className="mt-2 text-xs text-muted-foreground">{event.status === 'lead' ? '正文不足，仅作线索' : event.category === 'administrative' || administrativeTitle.test(event.title) ? '治理公告，不参与投资判断' : event.priority >= 4 ? '具有产业影响的事件证据' : '一般事件，未列入重点分析'}</p>
      <p className="mt-3 line-clamp-3 text-sm leading-6">{event.excerpt}</p>
      <details className="mt-2"><summary className="cursor-pointer text-xs text-primary">查看全文摘录与来源</summary><p className="mt-2 whitespace-pre-wrap text-sm leading-6">{event.excerpt}</p><div className="mt-2 flex flex-wrap gap-3">{event.urls.map((url, index) => /^https?:\/\//.test(url) ? <a key={url} href={url} target="_blank" rel="noreferrer" className="text-xs text-primary underline">原文 {index + 1}</a> : null)}{event.evidenceIds.map((id, index) => <a key={id} href={`${baseUrl}&evidence=${encodeURIComponent(id)}`} target="_blank" rel="noreferrer" className="text-xs text-primary underline">冻结记录 {index + 1}</a>)}</div></details>
    </article>)}</div>
    {!rows.length && <p className="rounded-xl border border-dashed p-5 text-sm text-muted-foreground">本轮没有此类材料。</p>}
    {limit < rows.length && <Button variant="outline" onClick={() => setLimit(value => value + 24)}>加载更多事件</Button>}
    {mode === 'appendix' && <details className="rounded-xl border p-4"><summary className="cursor-pointer text-sm font-medium">冻结数据目录（{evaluation?.evidence.length || 0} 条）</summary><div className="mt-3 max-h-80 overflow-auto">{evaluation?.evidence.slice(0, sourceLimit).map((item, index) => <a className="block border-b py-2 text-xs text-primary" key={item.id} href={`${baseUrl}&evidence=${encodeURIComponent(item.id)}`} target="_blank" rel="noreferrer">{index + 1}. {chineseSource(item.source)} · {item.dataDate || item.publishedAt?.slice(0, 10) || '日期未标注'} · {item.id.slice(-12)}</a>)}</div>{sourceLimit < (evaluation?.evidence.length || 0) && <Button className="mt-3" variant="outline" size="sm" onClick={() => setSourceLimit(value => value + 60)}>加载更多来源</Button>}</details>}
  </section>
}
