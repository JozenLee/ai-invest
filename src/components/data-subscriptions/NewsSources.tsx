'use client'
import { useCallback, useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { NewsUpdateHistory } from './NewsUpdateHistory'
import { Card } from '@/components/ui/card'
import { Switch } from '@/components/ui/switch'
import { SchedulerDialog } from '@/components/events/SchedulerDialog'
import { RefreshCw, Settings2 } from 'lucide-react'

type Source = { id: string; name: string; category: string; provider: string; type: string; typeLabel: string; driverType: string; driverTypeLabel: string; categoryLabel: string; isActive: boolean; statusLabel: string; updateFrequency: number; lastFetchAt?: string; lastFetchStatus?: string; lastFetchCount?: number; lastProcessedCount?: number; lastFailedCount?: number; errorMessage?: string; stats?: { articlesCount: number }; scheduler?: { id: string; scheduleType: string; scheduleTypeLabel: string; scheduleConfig: Record<string, any>; isEnabled: boolean; lastRunAt?: string; nextRunAt?: string } | null }
export default function NewsSources() {
  const [sources, setSources] = useState<Source[]>([]), [error, setError] = useState(''), [loading,setLoading] = useState(true)
  const [selected, setSelected] = useState<Source | null>(null), [busy,setBusy] = useState<string[]>([])
  const load = useCallback(async () => {
    try { const res = await fetch('/api/datasources', { cache: 'no-store' }); const data = await res.json(); if (!res.ok || !data.success) throw new Error(data.error || '加载失败'); setSources(data.data); setError('') }
    catch (error) { setError(String(error)) } finally { setLoading(false) }
  }, [])
  useEffect(() => { void load(); const timer = setInterval(load, 15000); return () => clearInterval(timer) }, [load])
  const act = async (source: Source, action: string, body?: unknown) => {
    setBusy(ids => [...ids,source.id]); setError('')
    try { const res = await fetch('/api/datasources/' + source.id + '/' + action, { method:'POST', headers:{'Content-Type':'application/json'}, body:body === undefined ? undefined : JSON.stringify(body) }); const payload = await res.json(); if (!res.ok || !payload.success) throw new Error(payload.error || payload.message || '操作失败'); await load() }
    catch(error) { setError(String(error)) } finally { setBusy(ids => ids.filter(id => id !== source.id)) }
  }
  return <section className="space-y-4"><div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="font-semibold">资讯数据源</h2><p className="text-xs text-muted-foreground">统一启停、采集计划和执行状态；Tushare 与其他资讯共用去重、AI分类与资讯流入库链路。</p></div><div className="flex gap-2"><NewsUpdateHistory /><Button variant="outline" onClick={() => void load()}><RefreshCw className="mr-2 size-4" />刷新状态</Button></div></div>
    {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
    <Card className="overflow-hidden"><div className="overflow-x-auto"><table className="w-full min-w-[700px] text-left text-sm"><thead className="bg-muted/40"><tr>{['数据源','启用','采集周期','最近采集 / 状态','入库资讯 / AI分类','操作'].map(label => <th key={label} className="p-3 font-medium">{label}</th>)}</tr></thead><tbody>{sources.map(source => <tr key={source.id} className="border-t"><td className="p-3"><p className="font-medium">{source.name}</p><p className="text-xs text-muted-foreground">{source.provider} · {source.categoryLabel}</p></td><td className="p-3"><Switch aria-label={'启用' + source.name} checked={source.isActive} disabled={busy.includes(source.id)} onCheckedChange={isActive => void act(source,'toggle',{isActive})} /></td><td className="p-3">{source.scheduler?.isEnabled ? String(source.scheduler.scheduleConfig.intervalMinutes || source.updateFrequency) + ' 分钟' : '定时已暂停'}</td><td className="p-3"><p>{source.lastFetchAt ? new Date(source.lastFetchAt).toLocaleString('zh-CN') : '尚未采集'}</p><p className="text-xs text-muted-foreground">{busy.includes(source.id) ? '处理中…' : source.lastFetchStatus === 'success' ? '成功' : source.lastFetchStatus === 'failed' ? '失败' : source.lastFetchStatus === 'partial' ? '已入库，AI分类待重试' : source.lastFetchStatus || '待执行'}</p>{source.errorMessage && <p className="max-w-72 break-words text-xs text-destructive">{source.errorMessage}</p>}</td><td className="p-3">{source.stats?.articlesCount || 0}<p className="mt-1 text-xs text-muted-foreground">本轮分类 {source.lastProcessedCount || 0} · 失败 {source.lastFailedCount || 0}</p></td><td className="p-3"><div className="flex gap-2"><NewsUpdateHistory sourceId={source.id} sourceName={source.name} /><Button size="sm" variant="outline" disabled={busy.includes(source.id)} onClick={() => void act(source,'fetch')}>立即采集</Button><Button size="sm" variant="ghost" onClick={() => setSelected(source)} aria-label={'配置' + source.name}><Settings2 className="size-4" /></Button></div></td></tr>)}</tbody></table>{loading && <p role="status" className="p-4 text-sm">加载中…</p>}{!loading && !sources.length && <p className="p-4 text-sm">暂无资讯数据源</p>}</div></Card>
    {selected && <SchedulerDialog open={Boolean(selected)} onOpenChange={open => { if (!open) setSelected(null) }} dataSource={selected} onUpdate={load} />}
  </section>
}
