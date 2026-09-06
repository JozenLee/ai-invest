'use client'
import { useEffect, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
type Dataset = { key: string; label: string; snapshot: { data: unknown; source: string; fetchedAt: string; dataDate: string | null; stale: boolean } | null }
const units: Record<string, string> = { market_volume: 'amount：千元；vol：手。此处不计算成交额放大倍数。', margin_balance: '余额与成交金额：元；数量字段按原始单位展示。', sector_capital_flow: '净流入金额：元；涨跌幅：%。', market_main_flow: '按源接口原字段与单位展示，净流入不等于新增资金。' }
export function MarketRawData() {
  const [data,setData] = useState<Dataset[]>([]), [error,setError] = useState('')
  useEffect(() => {
    let active = true
    const load = async () => { try { const res = await fetch('/api/data-subscriptions/market-data'); if (!res.ok) throw new Error('原始数据读取失败'); const payload = await res.json(); if (active) { setData(payload.data); setError('') } } catch (e) { if (active) setError(String(e)) } }
    void load(); const timer = setInterval(load,10000)
    return () => { active = false; clearInterval(timer) }
  },[])
  return <div className="mt-5 grid min-w-0 gap-4 xl:grid-cols-2">{error && <p role="alert">{error}</p>}{data.map(item => {
    const rows = item.snapshot ? (Array.isArray(item.snapshot.data) ? item.snapshot.data : [item.snapshot.data]) as Record<string, unknown>[] : []
    const priority: Record<string,string[]> = { market_volume: ['trade_date','ts_code','amount','vol','close','open','high','low'], market_main_flow: ['trade_date','net_amount','net_amount_rate','buy_elg_amount','buy_lg_amount','buy_md_amount','buy_sm_amount'], margin_balance: ['trade_date','exchange_id','rzye','rqye','rzrqye','rzmre','rzche'] }
    const columns = priority[item.key] || [...new Set(rows.slice(0,20).flatMap(row => Object.keys(row || {})))].slice(0,8)
    return <Card key={item.key} className="min-w-0"><CardHeader><div className="flex flex-wrap items-center justify-between gap-2"><CardTitle className="text-base">{item.label}</CardTitle><Badge variant="outline">{rows.length} 条原始记录</Badge></div><p className="text-xs text-muted-foreground">{item.snapshot?.source || '尚未入库'} · 更新 {item.snapshot ? new Date(item.snapshot.fetchedAt).toLocaleString('zh-CN') : '—'}</p><p className="text-xs text-muted-foreground">{units[item.key] || '保留来源原始字段，不在订阅页面生成分析指标。'}</p></CardHeader><CardContent><div className="max-h-72 overflow-auto rounded-lg border"><table className="w-full text-left text-xs"><thead className="sticky top-0 bg-muted"><tr>{columns.map(key => <th className="whitespace-nowrap p-2 font-medium" key={key}>{key}</th>)}</tr></thead><tbody>{rows.slice(0,20).map((row,index) => <tr key={index} className="border-t">{columns.map(key => <td key={key} className="max-w-64 truncate p-2" title={String(row[key] ?? '')}>{typeof row[key] === 'object' ? JSON.stringify(row[key]) : String(row[key] ?? '—')}</td>)}</tr>)}</tbody></table>{!rows.length && <p className="p-4 text-muted-foreground">暂无入库数据，请使用上方更新按钮。</p>}</div>{rows.length > 20 && <p className="mt-2 text-xs text-muted-foreground">表格预览前20条，完整数据见下方。</p>}<details className="mt-3 text-xs"><summary className="cursor-pointer text-primary">查看完整原始数据</summary><pre className="mt-2 max-h-80 overflow-auto whitespace-pre-wrap break-all rounded bg-muted p-3">{JSON.stringify(item.snapshot?.data ?? null,null,2)}</pre></details></CardContent></Card>
  })}</div>
}
