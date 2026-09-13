import type { ResearchOpportunity } from '@/lib/analysis/opportunity-ledger'

export function OpportunityLedger({ items }: { items: ResearchOpportunity[] }) {
  if (!items.length) return null
  const latestReviewedAt=items.reduce((latest,item)=>Date.parse(item.reviewedAt)>Date.parse(latest)?item.reviewedAt:latest,items[0].reviewedAt)
  const current=items.filter(item=>item.reviewedAt===latestReviewedAt)
  const history=items.filter(item=>item.reviewedAt!==latestReviewedAt)
  const list=(rows:ResearchOpportunity[])=>rows.map(item => <details key={item.id} className="rounded-xl border bg-background">
    <summary className="min-h-11 cursor-pointer p-4 text-sm leading-6 focus-visible:outline-2 focus-visible:outline-ring">
      <span className="font-medium">{item.title}</span><span className="ml-3 text-muted-foreground">{item.state}</span>
    </summary>
    <div className="space-y-3 border-t px-4 py-3 text-sm leading-6">
      <p>证据变化：{item.outcome}</p>{item.informationStatus&&<p className="text-muted-foreground">{item.informationStatus}</p>}
      {!!item.disclosureTimeline?.length&&<p className="text-muted-foreground">材料发布日期：{[...new Set(item.disclosureTimeline.map(event=>event.observedPublicationAt.slice(0,10)))].join("、")}；明确报告期：{[...new Set(item.disclosureTimeline.map(event=>event.reportPeriod).filter(Boolean))].join("、")||"待核验"}。材料发布日期不等于首次披露日。</p>}<p>首次记录：{item.firstSeenAt.slice(0,10)} · 本次复核：{item.reviewedAt.slice(0,10)}</p>
      <p>验证条件：{item.verification}</p><p>反证与失效：{item.invalidation}</p>
      <p>市场定价：{item.pricingAssessment}</p>
      <p>后续复核：{item.nextReview}</p>
      {item.exposure.length ? <ul className="space-y-2">{item.exposure.map(product => <li key={product.ticker}>
        {product.ticker}：相关企业披露权重 {product.weightPct.toFixed(2)}% · 披露期 {product.periods.join('、') || '待核验'}
        <p className="text-muted-foreground">{product.basis}</p>
      </li>)}</ul> : <p>当前产品池无已验证直接持仓映射，需补充适合的 ETF；不把图谱相关性视为收益暴露。</p>}
      {!!item.discoveryPlan?.length&&<ol className="space-y-2">{item.discoveryPlan.map(step=><li key={step.step}><strong>{step.step} · {step.status}</strong><p>{step.detail}</p></li>)}</ol>}{!!item.discoveryCandidates.length && <p>待补资料的候选产品：{item.discoveryCandidates.join('、')}（尚未通过产品门禁）</p>}
      {!!item.forwardObservation?.length && <div className="border-t pt-3"><p className="font-medium">首次记录后的价格跟踪</p>{item.forwardObservation.map(observation=><p key={observation.ticker}>{observation.ticker}：{observation.returnPct===null?'尚无下一完整交易日数据':`${observation.start} 至 ${observation.end}，区间涨跌 ${observation.returnPct.toFixed(2)}%，相对基准 ${observation.excessReturnPct===null?'待核验':observation.excessReturnPct.toFixed(2)+' 个百分点'}`}。</p>)}<p className="text-muted-foreground">仅跟踪价格，不代表实际成交或扣费后策略收益；不能据此证明事件因果。</p></div>}
    </div>
  </details>)
  return <section aria-label="机会跟踪与验证" className="mt-6 space-y-3 border-t pt-5">
    <h3 className="text-base font-semibold">机会跟踪与验证</h3>
    <p className="text-sm leading-6 text-muted-foreground">本轮复核 {current.length} 项。来源新增不等于超预期，持仓关联不等于收益兑现。展开查看验证条件与证据变化。</p>
    {list(current)}
    {!!history.length&&<details className="rounded-xl border border-dashed bg-muted/10 p-3"><summary className="min-h-11 cursor-pointer content-center text-sm font-medium focus-visible:outline-2 focus-visible:outline-ring">历史机会 {history.length} 项（展开复核）</summary><div className="mt-3 space-y-3">{list(history)}</div></details>}
  </section>
}
