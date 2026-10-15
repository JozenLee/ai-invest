import type { UnifiedAllocation } from '@/lib/research/strategy/kernel'
export function UnifiedAllocationView({allocation}:{allocation?:UnifiedAllocation|null}){
  if(!allocation)return null
  return <section aria-label="归档统一目标" className="mt-5 space-y-3 rounded-xl border p-4 text-sm leading-6">
    <h3 className="font-semibold">归档统一目标</h3>
    <p>策略 {allocation.strategy.name} · 版本 {allocation.strategy.id.slice(-12)} · {allocation.status==='ready'?'目标条件已核验':allocation.status==='partial'?'部分目标受限':'目标待核验'}</p>
    <p className="text-muted-foreground">这是报告生成时的研究组合目标，历史重放与每日执行均引用这份记录。实际账户按持仓差额、时效和风险上限计算，金额请查看每日执行。</p>
    <div className="grid gap-2 sm:grid-cols-2">{allocation.decisions.map(row=><div key={row.ticker} className="rounded-lg bg-muted/30 p-3"><p className="font-medium">{row.ticker} · {(allocation.priorTargets[row.ticker]||0)*100}% → {((allocation.targets[row.ticker]||0)*100).toFixed(2)}%</p><p>{row.reason}</p>{row.blockers.length>0&&<p>受限：{row.blockers.join('；')}</p>}</div>)}</div>
  </section>
}
