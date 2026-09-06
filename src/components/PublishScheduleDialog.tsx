'use client'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { CalendarClock } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { DEFAULT_PUBLISH_SCHEDULE, type PublishSchedule } from '@/lib/publish-schedule-config'

export function PublishScheduleDialog({ industries, accounts }: { industries: Array<{ id: string; name: string }>; accounts: Array<{ id: string; displayName: string }> }) {
  const [availableIndustries, setAvailableIndustries] = useState(industries)
  const [open, setOpen] = useState(false), [draft, setDraft] = useState<PublishSchedule>(DEFAULT_PUBLISH_SCHEDULE)
  const [times, setTimes] = useState('12:30, 14:30'), [tags, setTags] = useState('')
  const [error, setError] = useState(''), [busy, setBusy] = useState(false), [loaded, setLoaded] = useState(false)
  const [runs, setRuns] = useState<Array<{ id: string; slot: string; status: string; runId?: string; error?: string }>>([])
  useEffect(() => {
    if (!open) return
    setLoaded(false); setError('')
    void fetch('/api/data-subscriptions/industries').then(res => res.json()).then(payload => { if (payload.success) setAvailableIndustries(payload.data) }).catch(() => setError('产业列表读取失败，请刷新后重试'))
    void fetch('/api/publish/schedule').then(async res => { const payload = await res.json(); if (!res.ok) throw new Error(payload.error); setDraft(payload.data); setTimes(payload.data.times.join(', ')); setTags(payload.data.tags.join(', ')); setRuns(payload.runs); setLoaded(true) }).catch(error => setError(String(error)))
  }, [open])
  const save = async () => {
    setBusy(true); setError('')
    try {
      const res = await fetch('/api/publish/schedule', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...draft, times: times.split(/[,，]/).map(t => t.trim()).filter(Boolean), tags: tags.split(/[,，]/).map(t => t.trim()).filter(Boolean) }) })
      const payload = await res.json(); if (!res.ok) throw new Error(payload.error)
      setOpen(false)
    } catch (error) { setError(String(error)) } finally { setBusy(false) }
  }
  const statuses: Record<string,string> = { queued: '待执行', generating: '生成报告中', publishing: '发布中', published: '已发布', needs_review: '需人工核查', failed: '失败', cancelled: '已取消' }
  return <Dialog open={open} onOpenChange={setOpen}><DialogTrigger render={<Button variant="outline" />}><CalendarClock className="mr-2 size-4" />定时发布计划</DialogTrigger><DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-xl"><DialogHeader><DialogTitle>自动生成与发布</DialogTitle><DialogDescription>按北京时间每天执行；到点开始综合分析，完成后发布。电脑和数据服务须保持运行，错过超过5分钟不补发。仅使用公开研究数据，不包含个人持仓。</DialogDescription></DialogHeader><div className="space-y-4">
    <label className="flex min-h-11 items-center gap-2"><input type="checkbox" checked={draft.enabled} onChange={e => setDraft({ ...draft, enabled: e.target.checked })} />启用自动发布</label>
    <label className="block space-y-2"><span>每日开始时间（逗号分隔）</span><Input value={times} onChange={e => setTimes(e.target.value)} /></label>
    <fieldset className="rounded-lg border p-3"><legend className="px-1 text-sm">产业（可多选）</legend><div className="grid grid-cols-2 gap-2">{availableIndustries.map(industry => <label key={industry.id} className="flex min-h-11 items-center gap-2 text-sm"><input type="checkbox" checked={draft.industryIds.includes(industry.id)} onChange={e => setDraft({ ...draft, industryIds: e.target.checked ? [...draft.industryIds, industry.id] : draft.industryIds.filter(id => id !== industry.id) })} />{industry.name}</label>)}</div></fieldset>
    <label className="block space-y-2"><span>发布账号</span><select className="h-11 w-full rounded border bg-background px-3" value={draft.accountId} onChange={e => setDraft({ ...draft, accountId: e.target.value })}><option value="">请选择账号</option>{accounts.map(account => <option key={account.id} value={account.id}>{account.displayName}</option>)}</select></label>
    <label className="block space-y-2"><span>可见范围</span><select className="h-11 w-full rounded border bg-background px-3" value={draft.visibility} onChange={e => setDraft({ ...draft, visibility: e.target.value as PublishSchedule['visibility'] })}><option>仅自己可见</option><option>公开可见</option></select></label>
    <label className="block space-y-2"><span>话题（逗号分隔）</span><Input value={tags} onChange={e => setTags(e.target.value)} /></label>
    <label className="flex min-h-11 items-center gap-2"><input type="checkbox" checked={draft.isOriginal} onChange={e => setDraft({ ...draft, isOriginal: e.target.checked })} />声明原创</label>
    {error && <p role="alert" className="text-sm text-destructive">{error}</p>}<Button className="w-full" disabled={busy || !loaded} onClick={() => void save()}>{busy ? '保存中…' : '保存计划'}</Button>
    {runs.length > 0 && <div className="space-y-2 border-t pt-3"><h3 className="text-sm font-medium">最近执行</h3>{runs.map(run => <div key={run.id} className="rounded border p-2 text-xs"><p>{run.slot} · {statuses[run.status] || run.status}</p>{run.runId && <Link className="text-primary underline" href={'/comprehensive-analysis?runId=' + run.runId}>查看完整流程与报告</Link>}{run.error && <p className="break-words text-destructive">{run.error}</p>}</div>)}</div>}
  </div></DialogContent></Dialog>
}
