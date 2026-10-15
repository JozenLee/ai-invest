import type { DomainResearch } from '@/lib/workflow/domain-research'

export function DomainResearchView({ research, baselineConclusion, validation }: { research?: DomainResearch | null; baselineConclusion?: string; validation?: { matured: number; pending: number; excluded: number; basis: string } | null }) {
  if (!research) return null
  if (research.status !== 'completed' || !research.opinion) return <section aria-label="独立领域研究" className="rounded-xl border bg-card p-5"><h2 className="text-lg font-semibold">独立领域研究</h2><p className="mt-2 text-sm leading-6">{research.reason || '本轮未生成新领域观点'}</p></section>
  const opinion = research.opinion
  return <section aria-label="独立领域研究" className="space-y-5 rounded-xl border bg-card p-5 sm:p-6">
    <header><h2 className="text-xl font-semibold">领域投资价值</h2><p className="mt-1 text-sm text-muted-foreground">基于公开证据独立研判，不含个人账户。证据时点：{research.asOf}</p></header>
    <p className="text-base leading-7">{opinion.conclusion}</p>
    <div className="grid gap-4 md:grid-cols-2">{[opinion.strategic, opinion.tactical].map(view => <div key={view.horizon} className="rounded-lg border p-4"><p className="text-sm text-muted-foreground">{view.horizon}</p><h3 className="mt-1 font-semibold">{view.stance}</h3><p className="mt-2 text-sm leading-6">{view.reason}</p></div>)}</div>
    <p className="rounded-lg bg-muted p-3 text-sm leading-6">以上是研究观点，不是交易许可。产品流动性、申赎条件、费用及行情时效在执行层单独核验。</p>
    <div className="grid gap-5 md:grid-cols-2">{[['主要依据', opinion.drivers], ['反证与风险', opinion.counterEvidence]].map(([label, rows]) => <div key={String(label)}><h3 className="font-semibold">{String(label)}</h3><ul className="mt-2 list-disc space-y-2 pl-5 text-sm leading-6">{(rows as typeof opinion.drivers).map((row, i) => <li key={i}>{row.statement}<details className="text-muted-foreground"><summary className="min-h-11 cursor-pointer py-2 focus-visible:outline-2">证据编号</summary><p className="break-all">{row.evidenceIds.join('、')}</p></details></li>)}</ul></div>)}</div>
    {opinion.segments.length > 0 && <div><h3 className="font-semibold">细分方向</h3><div className="mt-3 grid gap-3 md:grid-cols-2">{opinion.segments.map(row => <article key={row.name} className="rounded-lg border p-4 text-sm leading-6"><h4 className="font-medium">{row.name}</h4><p>{row.thesis}</p><p className="mt-2">催化：{row.catalyst}</p><p>失效：{row.invalidation}</p></article>)}</div></div>}
    <div><h3 className="font-semibold">产品表达</h3><ul className="mt-2 space-y-2 text-sm leading-6">{opinion.products.map(row => <li key={row.ticker}><strong>{row.ticker}</strong>：{row.role}</li>)}</ul></div>
    <div><h3 className="font-semibold">何时改变判断</h3><ul className="mt-2 list-disc space-y-2 pl-5 text-sm leading-6">{opinion.watchConditions.map((row, i) => <li key={i}>{row.subject} · {row.window}：{row.observable} → {row.consequence}</li>)}</ul></div>
    <div><h3 className="font-semibold">证据边界</h3><ul className="mt-2 list-disc pl-5 text-sm leading-6">{opinion.limitations.map((row, i) => <li key={i}>{row}</li>)}</ul></div>
    {validation && <div className="rounded-lg border p-4 text-sm leading-6"><h3 className="font-semibold">前向观察</h3><p>已满20交易日：{validation.matured} 项 · 待观察：{validation.pending} 项 · 排除：{validation.excluded} 项</p><p className="mt-2 text-muted-foreground">{validation.basis}</p></div>}
    <details className="border-t pt-3"><summary className="min-h-11 cursor-pointer py-2 text-sm font-medium focus-visible:outline-2">与原分步流程对照</summary><p className="text-sm leading-6">{baselineConclusion || '本轮没有可用的基线结论。'}</p><p className="mt-3 text-sm leading-6 text-muted-foreground">同一快照，但证据选择、提示和模型可能不同，属于流程观察性对照。尚无前向收益证据，不能据此判定哪种更赚钱。</p></details>
  </section>
}
