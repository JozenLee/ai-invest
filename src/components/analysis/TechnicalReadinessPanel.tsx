import type { TechnicalReadiness } from '@/lib/research/technical-readiness'
const labels:Record<string,string>={'pending-publication':'待发布',stale:'日期未对齐',missing:'缺失',failed:'采集失败',invalid:'序列异常'}
export function TechnicalReadinessPanel({data}:{data?:TechnicalReadiness|null}) {
  if(!data)return null
  return <section aria-label="技术样本缺口与补齐" className="my-4 rounded-xl border bg-card p-4">
    <h3 className="font-semibold">技术样本缺口与补齐</h3>
    <p className="mt-2 text-sm leading-6 text-muted-foreground">当期有效 {data.usable}/{data.requested} · 研究日 {data.expectedSession||'待确认'} · 共同完整参考日 {data.referenceSession||'暂无'}。{data.boundary}</p>
    <a href="/data-center/subscriptions" className="mt-2 inline-flex min-h-11 items-center text-sm text-primary underline underline-offset-4">前往数据订阅补齐</a>
    <div className="mt-3 grid items-start gap-3 md:grid-cols-2">{data.perEtf.map(item=><details key={item.ticker} className="rounded-lg border">
      <summary className="min-h-11 cursor-pointer p-3 text-sm focus-visible:outline-2 focus-visible:outline-ring">{item.name}（{item.ticker}） · {item.issues.length?item.issues.map(issue=>labels[issue.status]||issue.status).filter((v,i,a)=>a.indexOf(v)===i).join('、'):'技术数据完整'}</summary>
      <div className="space-y-2 border-t p-3 text-sm leading-6"><p>日线 {item.latestPriceDate||'缺失'} · 复权 {item.latestFactorDate||'缺失'} · 指数 {item.latestIndexDate||'缺失'}</p>
        {item.issues.map(issue=><div key={issue.field}><p className="font-medium">{labels[issue.status]||issue.status}：{issue.detail}</p><p className="text-muted-foreground">补齐：{issue.action}</p></div>)}
        {item.reference&&<p className="rounded bg-muted/40 p-2">历史参考（{item.reference.date}）：20日涨跌 {item.reference.return20Pct?.toFixed(2)??'未知'}%，20日均线 {item.reference.ma20?.toFixed(4)??'未知'}，60日均线 {item.reference.ma60?.toFixed(4)??'未知'}。{item.reference.basis}</p>}
      </div></details>)}</div>
  </section>
}
