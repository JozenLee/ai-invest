'use client'

import { useEffect, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'

const object = (value: unknown): Record<string, unknown> => value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}
const strings = (value: unknown) => Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : []
const label = (value: unknown) => typeof value === 'string' ? value : ''
const finite = (value: unknown) => typeof value === 'number' && Number.isFinite(value) ? value : null
const percentage = (value: unknown) => finite(value) === null ? '待有效观察' : `${(value as number).toFixed(2)}%`
const arms: Record<string, string> = { 'no-trade': '不交易', rules: '规则对照', ai: 'AI方案' }
type Observation = {
  id: string; recordedAt: string; ready: boolean; reasons: string[]
  results: Array<{ arm: string; netReturnPct: number | null; maxDrawdownPct: number | null; turnoverPct: number | null }>
  comparisons: Array<{ arm: string; against: string; netReturnDifferencePp: number | null; drawdownDifferencePp: number | null }>
}
type View = { records: Observation[]; reason: string }
// Explicit projection: never retain/render original private portfolios or raw response JSON.
function readView(value: unknown, reportId: string): View {
  const root = object(value)
  if (root.reportId !== undefined && root.reportId !== reportId) throw new Error('响应报告与当前报告不一致。')
  if (!Array.isArray(root.records)) throw new Error('前向观察响应格式异常。')
  return { reason: label(root.reason), records: root.records.map((raw, index) => {
    const row = object(raw), cohort = object(row.cohort), evaluation = object(object(row.latest).evaluation)
    const gaps = strings(cohort.gaps)
    const reasons = [...gaps, ...strings(evaluation.reasons)]
    const ready = cohort.status === 'ready' && gaps.length === 0 && evaluation.status === 'paper-observed'
    const validMetrics = (arm: unknown) => {
      const result = Array.isArray(evaluation.results) ? evaluation.results.map(object).find(item => item.arm === arm) : undefined
      const metrics = object(result?.metrics)
      return ready && [metrics.netReturnPct, metrics.maxDrawdownPct, metrics.turnoverPct].every(value => finite(value) !== null) ? metrics : null
    }
    return {
      id: label(cohort.id) || String(index), recordedAt: label(cohort.recordedAt), ready, reasons,
      results: ['no-trade', 'rules', 'ai'].map(arm => {
        const metrics = validMetrics(arm) || {}
        return { arm, netReturnPct: finite(metrics.netReturnPct), maxDrawdownPct: finite(metrics.maxDrawdownPct), turnoverPct: finite(metrics.turnoverPct) }
      }),
      comparisons: ready && Array.isArray(evaluation.comparisons) ? evaluation.comparisons.map(object).filter(item => typeof item.arm === 'string' && item.arm in arms && typeof item.against === 'string' && item.against in arms && validMetrics(item.arm) && validMetrics(item.against)).map(item => ({ arm: label(item.arm), against: label(item.against), netReturnDifferencePp: finite(item.netReturnDifferencePp), drawdownDifferencePp: finite(item.drawdownDifferencePp) })) : [],
    }
  }) }
}

export function ForwardEvaluationPanel({ reportId }: { reportId: string }) {
  return <ForwardEvaluationForReport key={reportId} reportId={reportId}/>
}
function ForwardEvaluationForReport({ reportId }: { reportId: string }) {
  const [view, setView] = useState<View | null>(null)
  const [pending, setPending] = useState<'read' | 'update' | null>('read')
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const active = useRef<AbortController | null>(null)

  async function request(update: boolean) {
    if (!reportId || active.current) return
    const controller = new AbortController()
    active.current = controller
    let timedOut = false, appended = false
    const timer = setTimeout(() => { timedOut = true; controller.abort() }, 60000)
    const current = () => active.current === controller && !controller.signal.aborted
    try {
      if (update) {
        const response = await fetch('/api/portfolio/forward-evaluation', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ reportId }), signal: controller.signal })
        if (!response.ok) throw new Error(`更新失败（HTTP ${response.status}）。`)
        const result = object(await response.json())
        if (result.reportId !== undefined && result.reportId !== reportId) throw new Error('响应报告与当前报告不一致。')
        appended = true
        if (current()) setNotice(label(result.reason) || '观察更新请求已完成；报告冻结方案保持原样。')
      }
      const response = await fetch(`/api/portfolio/forward-evaluation?reportId=${encodeURIComponent(reportId)}`, { cache: 'no-store', signal: controller.signal })
      if (!response.ok) throw new Error(`读取失败（HTTP ${response.status}）。`)
      const next = readView(await response.json(), reportId)
      if (current()) setView(next)
    } catch (cause) {
      if (active.current === controller) setError(timedOut ? '请求超时；更新可能仍在服务端处理，请稍后重新读取当前报告观察。' : `${appended ? '更新请求已完成，但最新结果未读取成功。' : ''}${cause instanceof Error && /^(更新失败|读取失败|响应报告|前向观察响应)/.test(cause.message) ? cause.message : '网络或响应异常，请稍后重试。'}`)
    } finally {
      clearTimeout(timer)
      if (active.current === controller) { active.current = null; setPending(null) }
    }
  }
  function startRequest(update: boolean) {
    if (!reportId || active.current) return
    setPending(update ? 'update' : 'read'); setError(''); setNotice('')
    void request(update)
  }
  useEffect(() => {
    // Initial state already represents loading; request only updates state after network completion.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void request(false)
    return () => { active.current?.abort(); active.current = null }
    // A keyed component owns one report; requests and state are discarded on report change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reportId])

  return <section className="min-w-0 rounded-xl border bg-card p-4" aria-label="当前报告前向观察">
    <div className="flex flex-wrap items-center justify-between gap-3"><h3 className="font-semibold">前向观察 · 三组方案对照</h3><Button type="button" variant="outline" className="min-h-11" disabled={!!pending || !reportId} onClick={() => startRequest(true)}>{pending === 'update' ? '正在更新…' : '更新前向观察'}</Button></div>
    <p className="mt-2 text-xs leading-6 text-muted-foreground">仅观察当前报告冻结的不交易、规则与AI方案；更新只追加观察记录。纸面对照不代表真实成交，也不证明策略有效。样本、费用或时效条件不足时不计算收益。</p>
    {pending && <p role="status" className="mt-2 text-sm">{pending === 'read' ? '正在读取当前报告观察…' : '正在追加观察并读取结果…'}</p>}
    {error && <div className="mt-2"><p role="alert" className="text-sm text-destructive">{error}{view ? ' 下方为上次读取结果。' : ''}</p><Button type="button" variant="ghost" className="min-h-11" disabled={!!pending} onClick={() => startRequest(false)}>重新读取观察</Button></div>}
    {notice && <p role="status" className="mt-2 text-sm">{notice}</p>}
    {view?.reason && <p className="mt-2 text-sm">{view.reason}</p>}
    {view && !view.records.length && <p className="mt-2 text-sm text-muted-foreground">当前报告暂无可用前向记录，不会按事后行情补造方案。</p>}
    {view?.records.map(row => <details key={row.id} className="mt-3 rounded-lg border"><summary className="min-h-11 cursor-pointer p-3 text-sm font-medium hover:bg-muted/30 focus-visible:outline-2 focus-visible:outline-primary">{row.ready ? '已有纸面观察 · 尚未验证策略有效性' : '观察条件不足'} · 记录于 {row.recordedAt || '未知时间'}</summary><div className="space-y-3 border-t p-3 text-sm">
      {row.reasons.length > 0 ? <ul className="list-disc space-y-1 pl-5">{row.reasons.map((reason, i) => <li key={i}>{reason}</li>)}</ul> : !row.ready && <p>尚无满足条件的完整观察；等待样本、费用与时效校验。</p>}
      <div role="region" aria-label="前向观察收益比较" tabIndex={0} className="overflow-x-auto focus-visible:outline-2 focus-visible:outline-primary"><table className="w-full min-w-[460px] text-left"><caption className="sr-only">当前报告纸面对照结果</caption><thead><tr>{['方案', '净收益', '最大回撤', '换手'].map(title => <th key={title} scope="col" className="border-b p-2 font-medium">{title}</th>)}</tr></thead><tbody>{row.results.map(result => <tr key={result.arm}><th scope="row" className="p-2 font-normal">{arms[result.arm]}</th><td className="p-2 tabular-nums">{percentage(result.netReturnPct)}</td><td className="p-2 tabular-nums">{percentage(result.maxDrawdownPct)}</td><td className="p-2 tabular-nums">{percentage(result.turnoverPct)}</td></tr>)}</tbody></table></div>
      {row.comparisons.map((comparison, i) => <p key={i} className="text-xs leading-6 text-muted-foreground">{arms[comparison.arm]} 相对 {arms[comparison.against]}：净收益差 {comparison.netReturnDifferencePp === null ? '未知' : `${comparison.netReturnDifferencePp.toFixed(2)}个百分点`}；最大回撤差 {comparison.drawdownDifferencePp === null ? '未知' : `${comparison.drawdownDifferencePp.toFixed(2)}个百分点`}（按前者减后者展示，非未来收益预测）。</p>)}
    </div></details>)}
  </section>
}
