import { CheckCircle2, CircleAlert, ChevronDown } from 'lucide-react'
import { displayValue, isRecord, parseStructuredValue } from '@/lib/analysis/structured-data'
import { StructuredDataView } from './StructuredDataView'

type Artifact={artifactKey:string;data:unknown}
export function ExecutionQuality({artifacts}:{artifacts:Artifact[]}){
  const rows=artifacts.map(item=>({key:item.artifactKey,data:parseStructuredValue(item.data)})).filter((item):item is {key:string;data:Record<string,unknown>}=>isRecord(item.data)).map(item=>{
    const corrections=Array.isArray(item.data.issues)?item.data.issues.filter(issue=>typeof issue==='string'&&/^(?:判断日期|多期判断日期)已按冻结证据/.test(issue)):[]
    if(!corrections.length)return item
    const issues=(item.data.issues as unknown[]).filter(issue=>!corrections.includes(issue))
    return {...item,data:{...item.data,issues,corrections:[...(Array.isArray(item.data.corrections)?item.data.corrections:[]),...corrections],status:!issues.length&&item.data.status==='limited'?'corrected':item.data.status}}
  })
  const warnings=rows.filter(item=>['failed','fallback','limited','blocked'].includes(String(item.data.status))||Array.isArray(item.data.issues)&&item.data.issues.length>0)
  const label=(key:string)=>key==='ai-access-status'?'模型访问':key==='ai-request-status'?'模型请求':key.endsWith('-ai-status')?'分析方式':key.includes('graph')?'图谱校验':key==='data-quality'?'数据质量':'输出校验'
  return <section id="step-quality" className="rounded-xl border bg-card px-4 py-3"><div className="flex flex-wrap items-center gap-x-5 gap-y-2"><h2 className="text-sm font-semibold">运行与质量</h2>{rows.map(item=><span key={item.key} className="inline-flex items-center gap-1.5 text-xs">{warnings.includes(item)?<CircleAlert className="size-3.5 text-amber-600"/>:<CheckCircle2 className="size-3.5 text-emerald-600"/>}<span className="text-muted-foreground">{label(item.key)}</span><span>{item.key.startsWith('ai-')&&item.data.status==='blocked'?'上游访问受阻':item.data.status==='corrected'?'已校正':displayValue(item.data.status)||'已归档'}</span></span>)}</div>{warnings.length>0&&<p className="mt-2 text-xs leading-5 text-amber-700 dark:text-amber-300">{[...new Set(warnings.map(item=>item.data.reason||item.data.message||(Array.isArray(item.data.issues)?item.data.issues.slice(0,3).join('；'):null)||(item.key==='data-quality'?'数据缺口：'+Object.values((item.data.modules||{}) as Record<string,{status?:string;detail?:string}>).filter(module=>module.status!=='available').map(module=>module.detail).join('；'):null)).filter(Boolean).map(displayValue))].join('；')||'存在未通过的校验项，请查看下方详情。'}</p>}<details className="group mt-2"><summary className="flex min-h-8 cursor-pointer items-center gap-1 text-xs text-muted-foreground">校验详情<ChevronDown className="size-3 group-open:rotate-180"/></summary><div className="mt-2 space-y-3 border-t pt-3">{rows.map(item=><div key={item.key}><h3 className="mb-2 text-xs font-medium">{label(item.key)}</h3><StructuredDataView value={Object.fromEntries(Object.entries(item.data).filter(([key])=>!['usage','model','maxTokens','timeoutMs'].includes(key)))}/></div>)}</div></details></section>
}
