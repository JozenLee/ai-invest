'use client'
import { useCallback, useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { Badge } from '@/components/ui/badge'
import type { SubscriptionScope } from '@/lib/subscription-config'

type Schedule = { key: string; label: string; scope: string; enabled: boolean; targets: number; active: number; failed: number; nextRunAt: string | null; lastSuccessAt: string | null }
type Run = { id: string; targetCode: string; status: string; startedAt: string; completedAt: string | null; storedCount: number; fetchedCount: number; durationMs: number | null; qualityStatus: string | null; error: string | null; dataset: { datasetKey: string } }
const statusLabels: Record<string, string> = { queued: '已排队', running: '执行中', success: '成功', partial: '部分失败', failed: '失败' }
function time(value: string | null) { return value ? new Date(value).toLocaleString('zh-CN') : '尚无记录' }
export function countdown(next: string | null, now: number) {
  if (!next) return '等待首次调度'
  const seconds = Math.ceil((new Date(next).getTime() - now) / 1000)
  if (seconds <= 0) return '已到期，等待调度'
  return Math.floor(seconds / 3600) + '时 ' + Math.floor(seconds % 3600 / 60) + '分 ' + seconds % 60 + '秒'
}
export function SubscriptionOperations({ scope, pollSeconds = 5 }: { scope: SubscriptionScope; pollSeconds?: number }) {
  const [schedules, setSchedules] = useState<Schedule[]>([])
  const [runs, setRuns] = useState<Run[]>([])
  const [open, setOpen] = useState(false)
  const [now, setNow] = useState(0)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState<string | null>(null)
  const load = useCallback(async () => {
    try {
      const response = await fetch('/api/data-subscriptions/schedules', { cache: 'no-store' })
      if (!response.ok) throw new Error('读取调度状态失败')
      const payload = await response.json(); setSchedules(payload.data)
      if (open) {
        const history = await fetch('/api/data-subscriptions/runs', { cache: 'no-store' })
        if (!history.ok) throw new Error('读取更新记录失败')
        setRuns((await history.json()).data)
      }
      setError('')
    } catch (reason) { setError(reason instanceof Error ? reason.message : '读取失败') }
  }, [open])
  useEffect(() => { void load(); const timer = setInterval(() => void load(), pollSeconds * 1000); return () => clearInterval(timer) }, [load, pollSeconds])
  useEffect(() => { setNow(Date.now()); const timer = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(timer) }, [])
  async function refresh(key: string) {
    setBusy(key)
    try {
      const response = await fetch('/api/data-subscriptions/refresh', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ scope, datasetKey: key }) })
      const payload = await response.json()
      if (!response.ok || !payload.success) throw new Error(payload.error || '提交更新失败')
      await load()
    } catch (reason) { setError(reason instanceof Error ? reason.message : '提交失败') }
    finally { setBusy(null) }
  }
  return <section className="space-y-3" aria-label="订阅更新状态">
    <div className="flex flex-wrap items-center justify-between gap-3"><h3 className="font-semibold">数据类型与下次更新</h3><Dialog open={open} onOpenChange={setOpen}><DialogTrigger render={<Button variant="outline" />}>更新记录</DialogTrigger><DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-4xl"><DialogHeader><DialogTitle>订阅更新记录</DialogTitle><DialogDescription>保留最近 1000 条已结束执行，活动任务不清理；此处展示最近 200 条。排队不代表入库成功。</DialogDescription></DialogHeader>{error && <p role="alert" className="text-destructive">{error}</p>}<div className="space-y-3">{runs.map((run) => <article key={run.id} className="rounded-lg border p-3 text-sm"><div className="flex flex-wrap justify-between gap-2"><span>{schedules.find((item) => item.key === run.dataset.datasetKey)?.label || run.dataset.datasetKey} · {run.targetCode}</span><Badge variant={run.status === 'failed' ? 'destructive' : 'outline'}>{statusLabels[run.status] || run.status}</Badge></div><p className="mt-2 text-xs text-muted-foreground">开始 {time(run.startedAt)} · 结束 {time(run.completedAt)}</p><p className="mt-1 text-xs">采集 {run.fetchedCount} · 入库 {run.storedCount} · 耗时 {run.durationMs === null ? '—' : (run.durationMs / 1000).toFixed(1) + ' 秒'} · 质量 {run.qualityStatus || '待确认'}</p>{run.error && <p className="mt-2 break-words text-xs text-destructive">{run.error}</p>}</article>)}{!runs.length && <p className="text-muted-foreground">暂无执行记录</p>}</div></DialogContent></Dialog></div>
    {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{schedules.filter((item) => item.scope === scope).map((item) => <article className="rounded-xl border p-3" key={item.key}><div className="flex items-center justify-between gap-2"><h4 className="text-sm font-medium">{item.label}</h4><Button size="sm" variant="ghost" disabled={Boolean(busy) || item.active > 0} onClick={() => void refresh(item.key)}>{busy === item.key ? '提交中…' : '更新'}</Button></div><p className="mt-1 font-mono text-sm tabular-nums">{item.active ? `${item.active} 项排队 / 执行中` : !item.enabled ? '自动更新已暂停' : !item.targets ? '尚未建立订阅' : countdown(item.nextRunAt, now)}</p><p className="mt-2 text-xs text-muted-foreground">最近成功 {time(item.lastSuccessAt)}</p>{item.failed > 0 && <p className="mt-1 text-xs text-destructive">{item.failed} 项失败，请查看更新记录</p>}</article>)}</div>
  </section>
}
