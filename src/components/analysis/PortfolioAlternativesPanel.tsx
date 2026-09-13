'use client'

import { useEffect, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import type { PortfolioAlternatives, Alternative } from '@/lib/portfolio/alternatives'
import type { PortfolioDecisionSupport } from '@/lib/portfolio/decision-support'
import { portfolioDisplayText } from '@/lib/portfolio/display-text'
import { Badge } from '@/components/ui/badge'

const pct = (value: number | null | undefined) => typeof value === 'number' && Number.isFinite(value) ? `${value.toFixed(2)}%` : '未知'
const money = (value: number | null | undefined) => typeof value === 'number' && Number.isFinite(value) ? new Intl.NumberFormat('zh-CN', { style: 'currency', currency: 'CNY', maximumFractionDigits: 2 }).format(value) : '费用未知'
const range = (value: [number, number] | null, unit = '%') => value ? `${value[0].toFixed(2)} ～ ${value[1].toFixed(2)}${unit}` : '覆盖或费用不足，暂不可计算'
const sources = { hold: '不交易基线', rules: '规则对照', research: '研究备选', constraint: '约束修复对照' }
const summaryClass = 'min-h-11 cursor-pointer px-4 py-3 text-sm font-medium hover:bg-muted/40 focus-visible:outline-2 focus-visible:outline-primary'

export function PortfolioAlternativesPanel({ data, actions = [], executionReady = true }: { data: PortfolioAlternatives; actions?: PortfolioDecisionSupport['actions']; executionReady?: boolean }) {
  const names = Object.fromEntries(data.alternatives.flatMap(item => [[item.id, item.title], ...item.stress.map(s => [s.id, s.label])]))
  for (const [id, title] of Object.entries(names)) {
    const prefix = id.match(/^[PS]\d+(?=-|$)/)?.[0]
    if (prefix && Object.keys(names).filter(key => key === prefix || key.startsWith(prefix + '-')).length === 1) names[prefix] = title
  }
  const readable = (value: string) => portfolioDisplayText(value, names)
  function passed(item: Alternative) {
    return data.status === 'research-selected' && item.id === data.selectedId && item.source === 'research' && !item.hardViolations.length && !item.researchIssues.length
  }
  const selected = data.alternatives.find(item => item.id === data.selectedId)
  const selectedNeedsExecution = Boolean(selected?.trades.length)
  return <div className="min-w-0 space-y-4">
    <div className="rounded-xl border bg-primary/5 p-4">
      <div className="flex flex-wrap items-center gap-2"><h3 className="font-semibold">组合方案比较</h3><Badge variant="outline">{data.status === 'research-selected' ? '研究方案已选择' : data.status === 'constraint-review-required' ? '账户约束待处理' : '建议维持当前组合'}</Badge></div>
      <details className="mt-2"><summary className="min-h-11 cursor-pointer py-3 text-sm font-medium focus-visible:outline-2 focus-visible:outline-primary">查看方案选择理由</summary><p className="max-w-4xl text-sm leading-7">{readable(data.selectionReason || '未保存选择原因')}</p></details>
      <p className="mt-2 text-sm leading-6 text-muted-foreground">不交易保留现有暴露；规则方案用于对照；研究备选依据投资假设比较调整价值。研究方案未执行不代表无价值，执行前仍需核验产品交易条件。</p>
      {!executionReady && selectedNeedsExecution && <p className="mt-2 text-sm leading-6">选定方案的执行条件待复核。场内需更新报价与交易状态；场外需核验申赎窗口、适用费用及到账安排。</p>}
      {data.reviewIssues.length > 0 && <ul className="mt-2 list-disc space-y-1 pl-5 text-sm">{data.reviewIssues.map((issue, i) => <li key={i}>{readable(issue)}</li>)}</ul>}
    </div>
    {data.alternatives.length === 0 ? <p className="text-sm text-muted-foreground">本轮尚未保存可比较方案；不据此推导交易。</p> : <div className="grid gap-4 xl:grid-cols-3" aria-label="组合方案横向比较">{data.alternatives.map(item => <article key={item.id} className={`min-w-0 rounded-xl border p-4 ${item.id === data.selectedId ? 'border-primary/40 bg-primary/5' : 'bg-card'}`}>
      <div className="flex flex-wrap items-start justify-between gap-2"><h4 className="font-semibold leading-6">{readable(item.title)}</h4>{item.id === data.selectedId && <Badge variant="outline">本轮选中</Badge>}</div>
      <p className="mt-1 text-xs text-muted-foreground">{sources[item.source]} · {item.id === data.selectedId ? '本轮选中' : '比较方案'}</p>
      <p className="mt-3 text-sm">{item.id === data.selectedId && !item.trades.length ? '本轮选中 · 无交易动作' : item.hardViolations.length || item.researchIssues.length ? '存在待解决条件' : passed(item) ? '研究选择通过 · 执行另行校验' : '对照，不构成操作指令'}</p>
      <dl className="mt-4 space-y-3 border-t pt-4 text-sm">
        <div className="flex justify-between gap-3"><dt className="text-muted-foreground">到账前可用现金</dt><dd className="tabular-nums">{pct(item.immediatelyAvailableCashWeightPct)}</dd></div>
        <div className="flex justify-between gap-3"><dt className="text-muted-foreground">到账后现金（扣费后）</dt><dd className="tabular-nums">{item.netCashWeightPct == null ? '待费用确认' : pct(item.netCashWeightPct)}</dd></div>
        <div className="flex justify-between gap-3"><dt className="text-muted-foreground">到账后现金（扣费前）</dt><dd className="tabular-nums">{pct(item.grossCashWeightPct)}</dd></div>
        <div className="flex justify-between gap-3"><dt className="text-muted-foreground">预计交易费用</dt><dd className="tabular-nums">{item.trades.length ? money(item.totalFee) : '无交易'}</dd></div>
        <div className="flex justify-between gap-3"><dt className="text-muted-foreground">买卖金额占账户比例</dt><dd className="tabular-nums">{pct(item.turnoverPct)}</dd></div>
        <div className="flex justify-between gap-3"><dt className="text-muted-foreground">历史年化波动</dt><dd className="text-right tabular-nums">{item.risk.annualizedVolatilityPct == null ? item.risk.coveredAnnualizedVolatilityPct == null ? '全账户共同历史暂不可计算' : <><span>{pct(item.risk.coveredAnnualizedVolatilityPct)}</span><span className="block text-xs text-muted-foreground">已覆盖子组合</span></> : pct(item.risk.annualizedVolatilityPct)}</dd></div>
      </dl><p className="mt-3 border-t pt-3 text-xs leading-6 text-muted-foreground">历史数据覆盖账户 {pct(item.risk.coveragePct)}；全账户共同区间 {item.risk.commonObservations} 个{item.risk.coveredCommonObservations != null ? `，已覆盖子组合共同区间 ${item.risk.coveredCommonObservations} 个` : ''}。{item.risk.missingTickers?.length ? `未覆盖：${item.risk.missingTickers.join('、')}。` : ''}现金均为占账户资产比例；{item.trades.length && item.totalFee == null ? '该调整方案费用尚未确认，扣费前现金不能视为最终到账金额。' : '当前现金已按该方案的已知交易计算。'}</p>
    </article>)}</div>}

    {data.alternatives.map(item => <details key={item.id} className="rounded-xl border"><summary className={summaryClass}>{readable(item.title)} · 查看调整依据与风险情景</summary><div className="space-y-4 border-t p-4 text-sm leading-6">
      <p className="text-muted-foreground">压力情景是条件范围，不是预测收益或发生概率；净改善已计入已知费用，正值表示相对不交易更好，负值表示更差。费用未知时不声称净改善。若实际总交易费用占买卖双边交易总额的比例低于正的费用临界率，本情景下的最小毛改善才不会被费用吞噬；临界率不是实际费率、概率或收益保证。</p>
      {item.stress.length ? <div role="region" aria-label={`${readable(item.title)}压力情景`} tabIndex={0} className="overflow-x-auto focus-visible:outline-2 focus-visible:outline-primary"><table className="w-full min-w-[640px] text-left"><thead><tr>{['压力情景', '账户收益范围', '对不交易净改善（百分点）', '暴露覆盖'].map(label => <th key={label} scope="col" className="border-b px-3 py-2 font-medium">{label}</th>)}</tr></thead><tbody>{item.stress.map(s => <tr key={s.id}><th scope="row" className="max-w-72 border-b px-3 py-2 font-normal"><p>{readable(s.label)}</p><p className="text-xs text-muted-foreground">{readable(s.basis)}</p></th><td className="border-b px-3 py-2">{range(s.accountReturnRangePct)}</td><td className="border-b px-3 py-2">{range(s.improvementVsHoldPct, '个百分点')}{s.grossImprovementVsHoldPct && s.grossImprovementVsHoldPct.every(Number.isFinite) && <p className="mt-1 text-xs leading-5 text-muted-foreground">未扣费毛改善：{range(s.grossImprovementVsHoldPct, '个百分点')}</p>}{typeof s.maximumCostRateForImprovementPct === 'number' && Number.isFinite(s.maximumCostRateForImprovementPct) && <p className="mt-1 text-xs leading-5 text-muted-foreground">综合费用临界率：{pct(s.maximumCostRateForImprovementPct)}（按买卖双边交易总额）</p>}</td><td className="border-b px-3 py-2">{pct(s.coveredWeightPct)}</td></tr>)}</tbody></table></div> : <p>未保存压力情景，无法比较条件收益范围。</p>}
      <p className="text-muted-foreground">协方差与历史波动口径：{readable(item.risk.basis || '未保存计算口径')}。历史波动不代表未来损失上限。</p>
      {item.proposal && <dl className="grid gap-3 md:grid-cols-2">{[['为什么现在调整', item.proposal.whyNow], ['为什么不继续持有', item.proposal.whyNotHold], ['仓位与金额依据', item.proposal.sizingRationale], ['机会成本', item.proposal.opportunityCost], ['失效 / 撤销条件', item.proposal.invalidation], ['复核日期 / 节点', item.proposal.nextReview]].map(([label, value]) => <div key={label} className="rounded-lg bg-muted/30 p-3"><dt className="font-medium">{label}</dt><dd className="mt-1 text-muted-foreground">{readable(value || '未提供')}</dd></div>)}<div><dt className="font-medium">研究期限</dt><dd>{item.proposal.horizonDays} 个交易日</dd></div></dl>}
      {[...item.hardViolations, ...item.researchIssues, ...item.executionGaps].length > 0 && <div><h4 className="font-medium">研究与执行待解决项</h4><ul className="list-disc pl-5">{[...new Set([...item.hardViolations, ...item.researchIssues, ...item.executionGaps])].map((gap, i) => <li key={i}>{portfolioDisplayText(gap)}</li>)}</ul></div>}
      {item.trades.length > 0 && <div><h4 className="font-medium">逐基金条件操作</h4><p className="mb-2 text-xs text-muted-foreground">研究与硬约束通过、产品依据已核验的方案可展示测算金额；是否采用以本轮选择为准。</p>{item.trades.map(trade => {
        const action = actions.find(a => a.ticker === trade.ticker)
        const unselectedResearch = item.id !== data.selectedId && item.source === 'research' && !item.hardViolations.length && !item.researchIssues.length
        const showAmount = action?.mapping.verified && Number.isFinite(trade.amount) && (passed(item) && action.amount != null || unselectedResearch)
        return <div key={trade.ticker} className="border-t py-3"><p className="font-medium">{readable(action?.name || trade.ticker)} <span className="font-mono text-xs">{trade.ticker}</span></p><p>{showAmount && unselectedResearch && <strong className="mb-2 block rounded border border-amber-500/40 bg-amber-500/10 p-2 text-amber-800 dark:text-amber-200">未采用方案测算，不是当前操作建议</strong>}{showAmount ? `${trade.changeWeightPct < 0 ? '减少' : '增加'} ${money(trade.amount)}；当前 ${pct(trade.currentWeightPct)} → 方案 ${pct(trade.targetWeightPct)}` : '金额暂不展示：研究或硬约束未通过、产品依据未核验，或当前方案金额未确认。'}</p>{showAmount && <p>预计份额 {trade.estimatedUnits?.toFixed(2) ?? '待净值 / 份额校验'}；{money(trade.estimatedFee)}</p>}<p className="text-muted-foreground">到账时间：{trade.settlementDays == null ? '未知，需核验产品与渠道规则' : `${trade.settlementDays}天（依产品与渠道规则确认起算及工作日口径）`}</p>{trade.executionGaps.length > 0 && <p className="text-muted-foreground">{readable(trade.executionGaps.join('；'))}</p>}</div>
      })}</div>}
    </div></details>)}
    <p className="text-xs leading-6 text-muted-foreground">证据边界：{data.evidenceBoundary || '未保存'} · 快照 {new Date(data.asOf).toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai', hour12: false })}</p>
  </div>
}

const record = (value: unknown): Record<string, unknown> => value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}
const text = (value: unknown, fallback = '未提供') => portfolioDisplayText(typeof value === 'string' && value ? value : fallback)
const productLabels: Record<string, string> = { etf: '场内指数基金', feeder: '联接基金', active: '主动基金', 'index-enhanced': '指数增强', index: '指数基金', qdii: '境外投资基金', other: '其他产品', unknown: '类型待核验' }
type RefreshResult = { ticker: string; status: 'refreshed' | 'partial' | 'failed'; gaps: string[] }
const refreshLabels = { refreshed: '资料已刷新', partial: '部分刷新', failed: '刷新失败' }

function ProductResearchRefresh({ viewingLatest = false }: { viewingLatest?: boolean }) {
  const [pending, setPending] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [results, setResults] = useState<RefreshResult[] | null>(null)
  const requestRef = useRef<AbortController | null>(null)
  useEffect(() => () => { requestRef.current?.abort(); requestRef.current = null }, [])

  async function refresh() {
    if (requestRef.current) return
    const controller = new AbortController()
    requestRef.current = controller
    setPending(true)
    setError('')
    setResults(null)
    setNotice('')
    let timedOut = false
    const timer = setTimeout(() => { timedOut = true; controller.abort() }, 305000)
    try {
      const response = await fetch('/api/portfolio/product-research', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({}), signal: controller.signal,
      })
      if (!response.ok) throw new Error(`刷新请求失败（状态码 ${response.status}），请稍后重试。`)
      const payload = record(await response.json())
      if (!Array.isArray(payload.results) || !payload.results.every(value => {
        const row = record(value)
        return typeof row.ticker === 'string' && ['refreshed', 'partial', 'failed'].includes(String(row.status)) && Array.isArray(row.gaps) && row.gaps.every(gap => typeof gap === 'string')
      })) throw new Error('刷新响应格式异常，无法确认各基金结果。')
      if (requestRef.current === controller && !controller.signal.aborted) {
        setResults(payload.results as RefreshResult[])
        setNotice([typeof payload.collectionWarning === 'string' ? payload.collectionWarning : '', Array.isArray(payload.queuedUnderlyingDatasets) && payload.queuedUnderlyingDatasets.length ? `已安排 ${payload.queuedUnderlyingDatasets.length} 项底层指数基金采集任务，请在数据订阅中查看进度。` : ''].filter(Boolean).join(' '))
      }
    } catch (cause) {
      if (requestRef.current === controller) setError(timedOut ? '请求超时，服务端可能仍在采集；请稍后查看资料或重试，归档快照未更新。' : cause instanceof Error && /^(刷新请求失败|刷新响应格式异常)/.test(cause.message) ? cause.message : '网络或响应异常，无法确认刷新结果，请稍后重试。')
    } finally {
      clearTimeout(timer)
      if (requestRef.current === controller) { requestRef.current = null; setPending(false) }
    }
  }
  return <div className="mt-3 rounded-lg border bg-muted/20 p-3">
    <Button type="button" variant="outline" className="min-h-11" disabled={pending} onClick={refresh}>{pending ? '正在刷新基金资料…' : '刷新基金资料'}</Button>
    <p className="mt-2 text-xs leading-6 text-muted-foreground">手动刷新当前账户全部持仓的公开基金资料。新建分析后才会更新报告快照；{viewingLatest ? '刷新完成后，点击“查看最新已入库资料”读取采集结果。' : '下方仍展示本报告冻结资料。'}</p>
    {pending && <p role="status" className="mt-2 text-sm">正在采集，请勿重复提交；最长等待约5分钟。</p>}
    {notice && <p role="status" className="mt-2 text-sm">{notice}</p>}
    {error && <p role="alert" className="mt-2 text-sm text-destructive">{error}</p>}
    {results !== null && <div role="status" className="mt-3 text-sm"><p className="font-medium">本次刷新结果</p>{results.length === 0 ? <p className="mt-1">未返回基金结果，无法确认资料是否已更新。</p> : <ul className="mt-2 space-y-2">{results.map((row, i) => <li key={`${row.ticker}-${i}`} className="rounded border bg-background p-3"><p><span className="font-mono">{row.ticker}</span> · {refreshLabels[row.status]}</p>{row.gaps.length ? <ul className="mt-1 list-disc pl-5 text-muted-foreground">{row.gaps.map((gap, j) => <li key={j}>{portfolioDisplayText(gap)}</li>)}</ul> : <p className="mt-1 text-muted-foreground">接口未返回采集缺口，不代表研究或交易校验已通过。</p>}</li>)}</ul>}</div>}
  </div>
}

export function PortfolioProductResearchPanel({ value }: { value: unknown }) {
  const [latest, setLatest] = useState<Record<string, unknown> | null>(null)
  const [loadingLatest, setLoadingLatest] = useState(false)
  const [latestError, setLatestError] = useState('')
  const [showLatest, setShowLatest] = useState(false)
  const root = showLatest && latest ? latest : record(value)
  async function loadLatest() {
    if (loadingLatest) return
    setLoadingLatest(true); setLatestError('')
    try {
      const response = await fetch('/api/portfolio/product-research', { cache: 'no-store', signal: AbortSignal.timeout(30000) })
      if (!response.ok) throw new Error('无法读取最新基金资料，请稍后重试。')
      const body = record(await response.json()), research = record(body.research)
      if (!Array.isArray(research.products)) throw new Error('最新基金资料格式异常，请稍后重试。')
      setLatest(research); setShowLatest(true)
    } catch { setLatestError('无法读取最新基金资料，请稍后重试。') }
    finally { setLoadingLatest(false) }
  }
  const products = Array.isArray(root.products) ? root.products.map(record) : []
  const [onlyGaps, setOnlyGaps] = useState(false)
  const shown = products.filter(product => !onlyGaps || (Array.isArray(product.gaps) && product.gaps.length > 0))
  return <div className="rounded-xl border p-4 sm:p-5"><h3 className="font-semibold">实际持仓产品研究</h3><div className="mt-3 flex flex-wrap gap-2"><Button variant="outline" disabled={loadingLatest} onClick={loadLatest}>{loadingLatest ? '读取中…' : '查看最新已入库资料'}</Button>{showLatest && <Button variant="ghost" onClick={() => setShowLatest(false)}>返回报告原始资料</Button>}</div><p className="mt-2 text-sm leading-6 text-muted-foreground">{showLatest ? '正在查看最新已入库资料，仅用于核对补齐情况；上方方案仍使用生成报告时的资料，新建分析后才会重新计算。' : '正在查看生成报告时保存的资料；后续采集的数据不会自动改写当时的结论。'}</p>{latestError && <p role="alert" className="mt-2 text-sm text-destructive">{latestError}</p>}<p className="mt-2 text-sm leading-6 text-muted-foreground">全账户 {products.length} 只基金。资料覆盖表示已取得数据，不代表可以交易。</p><div className="mt-4 grid grid-cols-2 gap-3 lg:grid-cols-4">{[['nav', '基金净值'], ['adjustedNav', '复权净值'], ['holdings', '披露持仓'], ['allocation', '资产配置']].map(([key, label]) => <div key={key} className="rounded-lg bg-muted/40 p-3"><p className="text-xs text-muted-foreground">{label}</p><p className="mt-1 text-lg font-semibold tabular-nums">{products.filter(p => record(p.coverage)[key] === true).length}<span className="text-sm font-normal text-muted-foreground"> / {products.length} 只</span></p></div>)}</div><ProductResearchRefresh viewingLatest={showLatest}/><label className="mt-4 flex min-h-11 cursor-pointer items-center gap-2 text-sm"><input type="checkbox" checked={onlyGaps} onChange={event => setOnlyGaps(event.target.checked)} className="size-4"/>只看有待补资料的基金</label>{!products.length ? <p className="mt-2 text-sm text-muted-foreground">本轮未保存产品研究资料，不能以基金名称或领域归属代替产品暴露核验。</p> : shown.map((product, i) => {
    const coverage = record(product.coverage), exposure = record(product.exposure), mapping = record(product.officialMapping)
    const nav = Array.isArray(product.navSeries) ? product.navSeries.map(record).filter(n => typeof n.date === 'string' && typeof n.nav === 'number' && Number.isFinite(n.nav)).sort((a,b) => String(a.date).localeCompare(String(b.date))).at(-1) : undefined
    const window = record(coverage.adjustedNavWindow)
    const gaps = Array.isArray(product.gaps) ? product.gaps.map(g => text(record(g).detail, '')).filter(Boolean) : []
    const identityLabel = product.classification === 'official' ? '正式关系已核验' : product.classification === 'source-verified' ? '基金代码与名称已核验' : '类型待正式资料核验'
    return <details key={text(product.ticker, String(i))} className="mt-3 rounded-lg border"><summary className={summaryClass}>{text(product.name)} · {text(product.ticker)} · {productLabels[String(product.productType)] || '类型待核验'} · {identityLabel}</summary><div className="space-y-3 border-t p-4 text-sm leading-6">{nav && <p>最近净值 <strong className="tabular-nums">{(nav.nav as number).toFixed(4)}</strong> 元 · 净值日期 {String(nav.date)}</p>}{typeof window.observations === 'number' && <p>可用于历史风险计算的复权净值：{window.observations} 个观测日{window.start && window.end ? `（${window.start} 至 ${window.end}）` : ''}；组合风险还需要至少60个共同收益区间。</p>}<p>{coverage.mappingRequired === true ? `正式目标指数基金：${text(mapping.targetEtfCode, '待核验')}；跟踪指数：${text(mapping.targetIndexName, text(mapping.targetIndexCode, '待核验'))}` : '按产品自身净值、披露持仓和资产配置研究；不强制套用目标指数基金。'}</p><p>净值：{coverage.nav === true ? '有资料' : '待补齐'}；复权净值：{coverage.adjustedNav === true ? '有资料' : '待补齐'}；披露持仓：{coverage.holdings === true ? '有资料' : '待补齐'}；资产配置：{coverage.allocation === true ? '有资料' : '待补齐'}</p><p>持仓报告期 {text(exposure.reportDate, '未知')}；已披露权重 {pct(typeof exposure.knownWeightPct === 'number' ? exposure.knownWeightPct : null)}；未观察权重 {pct(typeof exposure.unobservedWeightPct === 'number' ? exposure.unobservedWeightPct : null)}</p><p className="text-muted-foreground">{text(exposure.limitation, '披露覆盖不等于当前实际持仓，也不代表研究选择或执行通过。')}</p>{gaps.length > 0 && <ul className="list-disc pl-5">{gaps.map((gap, j) => <li key={j}>{portfolioDisplayText(gap)}</li>)}</ul>}</div></details>
  })}</div>
}
