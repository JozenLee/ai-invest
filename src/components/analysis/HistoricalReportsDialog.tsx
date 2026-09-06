'use client'

import { useMemo } from 'react'
import Link from 'next/link'
import { ArrowUpRight, CheckCircle2, FileText, History, Layers3, Loader2 } from 'lucide-react'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { chineseNarrative } from '@/lib/analysis/chinese-labels'
import { cn } from '@/lib/utils'

export type HistoricalReportSummary={
  id:string;industryId:string;industryName:string;title:string;summary:string|null;createdAt:string;sessionDate?:string|null
  metadata?:{kind?:string;parentRunId?:string|null};quality?:{overallScore?:number;grade?:string}|null
  recommendation:{confidencePct:number;stateCounts:Record<string,number>}
  includedInNextAnalysis?:boolean;inclusionLabel?:string
}

type Policy={enabled:boolean;lookbackTradingDays:number;mode:'latest-per-trading-day'}
const time=(value:string)=>new Date(value).toLocaleString('zh-CN',{month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit'})

export function HistoricalReportsDialog({open,onOpenChange,onConfigure,reports,loading,contextIndustryId,contextIndustryName,policy}:{open:boolean;onOpenChange:(open:boolean)=>void;onConfigure:()=>void;reports:HistoricalReportSummary[];loading:boolean;contextIndustryId:string;contextIndustryName:string;policy:Policy|null}){
  const groups=useMemo(()=>{
    const map=new Map<string,HistoricalReportSummary[]>()
    for(const report of reports)map.set(report.industryId,[...(map.get(report.industryId)||[]),report])
    return [...map.entries()].map(([industryId,items])=>({industryId,name:items[0]?.industryName||industryId,items})).sort((a,b)=>a.industryId===contextIndustryId?-1:b.industryId===contextIndustryId?1:a.name.localeCompare(b.name,'zh-CN'))
  },[reports,contextIndustryId])
  const included=reports.filter(item=>item.includedInNextAnalysis).length
  return <Dialog open={open} onOpenChange={onOpenChange}><DialogContent className="max-h-[90dvh] overflow-y-auto p-0 sm:max-w-4xl">
    <DialogHeader className="border-b p-6"><div className="flex items-center gap-3"><span className="rounded-xl bg-primary/10 p-2 text-primary"><History className="size-5"/></span><div><DialogTitle className="text-xl">历史报告库</DialogTitle><DialogDescription className="mt-1">按产业领域聚合，并标记下一轮综合分析实际使用的报告。</DialogDescription></div></div></DialogHeader>
    <div className="p-6"><div className="mb-5 grid gap-3 sm:grid-cols-3"><div className="rounded-xl border bg-muted/20 p-4"><p className="text-xs text-muted-foreground">当前产业领域</p><p className="mt-2 font-medium">{contextIndustryName||'尚未选择'}</p></div><div className="rounded-xl border bg-muted/20 p-4"><p className="text-xs text-muted-foreground">历史上下文规则</p><p className="mt-2 font-medium">{policy?.enabled?`最近 ${policy.lookbackTradingDays} 个交易日`:'未启用'}</p><Button variant="link" className="mt-2 h-auto min-h-8 p-0 text-xs" onClick={onConfigure}>调整纳入规则</Button></div><div className="rounded-xl border bg-muted/20 p-4"><p className="text-xs text-muted-foreground">将纳入下一轮</p><p className="mt-2 font-mono text-xl font-semibold">{included} 份</p></div></div>
      {loading?<div className="flex min-h-56 items-center justify-center gap-2 text-sm text-muted-foreground"><Loader2 className="size-4 animate-spin motion-reduce:animate-none"/>正在读取历史报告…</div>:<div className="space-y-4">{groups.map(group=><details key={group.industryId} open={group.industryId===contextIndustryId} className="overflow-hidden rounded-2xl border bg-card"><summary className="flex min-h-14 cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 hover:bg-muted/30"><span className="flex min-w-0 items-center gap-3"><Layers3 className="size-4 shrink-0 text-primary"/><span><span className="block font-medium">{chineseNarrative(group.name)}</span><span className="block text-xs text-muted-foreground">{group.items.length} 份报告</span></span></span>{group.industryId===contextIndustryId&&<Badge variant="outline">当前分析领域</Badge>}</summary><div className="grid gap-3 border-t p-3 md:grid-cols-2">{group.items.map(report=><Link key={report.id} href={`/comprehensive-analysis/report/${report.id}`} className={cn('group/report rounded-xl border p-4 transition-colors hover:border-primary/35 focus-visible:outline-2 focus-visible:outline-ring',report.includedInNextAnalysis?'border-emerald-500/30 bg-emerald-500/[0.04]':'bg-background')}><div className="flex items-start justify-between gap-3"><span className="rounded-lg bg-muted p-2"><FileText className="size-4"/></span><Badge variant="outline" className={cn('shrink-0',report.includedInNextAnalysis?'border-emerald-500/30 text-emerald-700 dark:text-emerald-300':'text-muted-foreground')}>{report.includedInNextAnalysis&&<CheckCircle2 className="mr-1 size-3"/>}{report.inclusionLabel||'历史记录'}</Badge></div><h3 className="mt-3 line-clamp-2 text-sm font-semibold leading-6">{chineseNarrative(report.title)}</h3><p className="mt-2 line-clamp-2 text-xs leading-5 text-muted-foreground">{chineseNarrative(report.summary||'暂无摘要')}</p><div className="mt-3 flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-muted-foreground"><span>报告 {time(report.createdAt)}</span><span>交易日 {report.sessionDate||'未标注'}</span><span>置信度 {report.recommendation.confidencePct}%</span></div><span className="mt-3 inline-flex min-h-9 items-center gap-1 text-xs font-medium text-primary">打开报告<ArrowUpRight className="size-3.5"/></span></Link>)}</div></details>)}{!groups.length&&<div className="rounded-2xl border p-10 text-center text-sm text-muted-foreground">暂无历史报告。完成第一轮综合分析后会自动归档到这里。</div>}</div>}
    </div>
  </DialogContent></Dialog>
}
