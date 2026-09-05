'use client'
import { useEffect, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
export function MarketReferenceData() {
  const [rows,setRows] = useState<any[]>([])
  useEffect(() => { let active=true; const load=async()=>{ const res=await fetch('/api/data-subscriptions/market-data'); if(res.ok && active) setRows((await res.json()).data || []) }; void load().catch(()=>undefined); const timer=setInterval(()=>{if(!document.hidden) void load().catch(()=>undefined)},30000); return()=>{active=false;clearInterval(timer)} },[])
  const main = rows.find(row=>row.key==='market_main_flow')?.snapshot
  const margin = rows.find(row=>row.key==='margin_balance')?.snapshot
  const format=(value:unknown)=>typeof value==='number' && Number.isFinite(value) ? (value/1e8).toFixed(2)+' 亿元' : '暂无有效数据'
  return <section className="grid gap-4 sm:grid-cols-2"><Card><CardHeader><CardTitle className="text-base">大盘主力资金</CardTitle></CardHeader><CardContent><p className="text-2xl font-semibold tabular-nums">{format(main?.data?.[0]?.net_amount)}</p><p className="mt-2 text-xs text-muted-foreground">净流入为负表示净流出 · {main?.dataDate || '日期未知'}</p><p className="mt-2 text-xs text-muted-foreground">{main?.source || '尚未入库'} · 源单位元，展示换算为亿元，不代表市场新增资金。</p></CardContent></Card><Card><CardHeader><CardTitle className="text-base">融资融券余额</CardTitle></CardHeader><CardContent>{Array.isArray(margin?.data) ? margin.data.filter((row:any)=>row.trade_date===margin.data[0]?.trade_date).map((row:any,index:number)=><div key={index} className="mb-2 flex justify-between text-sm"><span>{row.exchange_id || '交易所'} · {row.trade_date}</span><span>{format(row.rzrqye)}</span></div>):<p>暂无有效数据</p>}<p className="mt-2 text-xs text-muted-foreground">按交易所分别展示，避免跨日期相加；余额不是当日净流入。</p></CardContent></Card></section>
}
