'use client'
import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'

type Log = { id: string; sourceName: string; status: string; message: string; fetchedCount: number; processedCount: number; failedCount: number; duration: number; error?: string; createdAt: string }
const labels: Record<string,string> = { success:'成功',failed:'失败',partial:'部分分类待重试',running:'执行中' }
export function NewsUpdateHistory({ sourceId, sourceName }: { sourceId?: string; sourceName?: string }) {
  const [open,setOpen] = useState(false), [page,setPage] = useState(0), [status,setStatus] = useState('')
  const [rows,setRows] = useState<Log[]>([]), [total,setTotal] = useState(0), [error,setError] = useState(''), [loading,setLoading] = useState(false)
  useEffect(() => {
    if (!open) return
    const controller = new AbortController()
    const load = async () => {
      setLoading(true)
      try { const params = new URLSearchParams({limit:'20',offset:String(page*20),...(sourceId ? {sourceId} : {}),...(status ? {status} : {})}); const res = await fetch('/api/datasources/logs?' + params, {signal:controller.signal}); const payload = await res.json(); if (!res.ok) throw new Error(payload.error); setRows(payload.data.items); setTotal(payload.data.total); setError('') }
      catch(error) { if (!controller.signal.aborted) setError(String(error)) } finally { if (!controller.signal.aborted) setLoading(false) }
    }
    void load(); const timer=setInterval(load,10000)
    return () => { controller.abort(); clearInterval(timer) }
  },[open,page,status,sourceId])
  return <Dialog open={open} onOpenChange={value => {setOpen(value); if(value)setPage(0)}}><DialogTrigger render={<Button variant="outline" size="sm" />}>{sourceId ? '记录' : '更新记录'}</DialogTrigger><DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-4xl"><DialogHeader><DialogTitle>{sourceName || '资讯数据源'}更新记录</DialogTitle><DialogDescription>回溯采集、去重、AI批量分类与缓存命中；每10秒刷新，保留原始错误。</DialogDescription></DialogHeader><label className="flex items-center gap-3 text-sm">状态筛选<select className="rounded border bg-background p-2" value={status} onChange={e=>{setStatus(e.target.value);setPage(0)}}><option value="">全部状态</option>{Object.entries(labels).map(([value,label])=><option key={value} value={value}>{label}</option>)}</select></label>{error && <p role="alert" className="text-destructive">{error}</p>}<div className="space-y-3">{rows.map(row=><article key={row.id} className="rounded-lg border p-3 text-sm"><div className="flex flex-wrap justify-between gap-2"><span>{row.sourceName} · {new Date(row.createdAt).toLocaleString('zh-CN')}</span><Badge variant={row.status==='failed'?'destructive':'outline'}>{labels[row.status]||row.status}</Badge></div><p className="mt-2 text-xs">采集 {row.fetchedCount} · AI成功 {row.processedCount} · 失败 {row.failedCount} · 耗时 {(row.duration/1000).toFixed(1)} 秒</p><p className="mt-2 break-words text-xs text-muted-foreground">{row.message}</p>{row.error&&<p className="mt-2 break-words text-xs text-destructive">{row.error}</p>}</article>)}{!rows.length&&<p role="status">{loading?'加载中…':'暂无记录'}</p>}</div><div className="flex items-center justify-between gap-3 text-sm"><Button variant="outline" disabled={!page||loading} onClick={()=>setPage(page-1)}>上一页</Button><span>{page+1} / {Math.max(1,Math.ceil(total/20))} · 共{total}条</span><Button variant="outline" disabled={(page+1)*20>=total||loading} onClick={()=>setPage(page+1)}>下一页</Button></div></DialogContent></Dialog>
}
