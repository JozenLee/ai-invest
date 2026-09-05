'use client'
import { useState } from 'react'
import type { Profile } from '@/lib/research/contracts'
import type { ResearchSchedule } from '@/lib/research/schedule'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Settings2, ShieldCheck, Clock3 } from 'lucide-react'

const labels:Record<keyof Profile['rules'],string>={minHistory:'历史交易日样本',maxPremiumPct:'最大绝对折溢价（%）',minDailyAmount:'最低日均成交额（元）',maxSpreadBps:'最大买卖价差（基点）',maxVolatilityPct:'最高年化波动率（%）',flowDays:'资金观察交易日',entryConfirmDays:'趋势确认交易日'}
export function ResearchSettings({profile,schedule,aiDestination,portfolioConsent,onClose,onSaved}:{profile:Profile;schedule:ResearchSchedule;aiDestination:string;portfolioConsent:boolean;onClose:()=>void;onSaved:(profile:Profile,schedule:ResearchSchedule,portfolioConsent:boolean)=>void}) {
  const [draft,setDraft]=useState(structuredClone(profile))
  const [sectors,setSectors]=useState(profile.sectors.join('，'))
  const [advanced,setAdvanced]=useState(JSON.stringify({segments:profile.segments,leaders:profile.leaders},null,2))
  const [enabled,setEnabled]=useState(schedule.enabled),[times,setTimes]=useState(schedule.times.join('，'))
  const [allowPortfolio,setAllowPortfolio]=useState(portfolioConsent)
  const [section,setSection]=useState('scope'),[saving,setSaving]=useState(false),[error,setError]=useState('')
  async function save(){
    setSaving(true);setError('')
    try{
      const extra=JSON.parse(advanced),next={...draft,sectors:sectors.split(/[,，]/).map(s=>s.trim()).filter(Boolean),segments:extra.segments,leaders:extra.leaders}
      const plan={enabled,times:times.split(/[,，]/).map(s=>s.trim()).filter(Boolean)}
      const response=await fetch(`/api/research/${encodeURIComponent(profile.industryId)}`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'settings',profile:next,schedule:plan})})
      const result=await response.json();if(!response.ok)throw new Error(result.error||'保存失败')
      onSaved(result.profile,result.schedule,allowPortfolio);onClose()
    }catch(e){setError(e instanceof SyntaxError?'产业映射 JSON 格式有误，请检查括号和引号。':e instanceof Error?e.message:'保存失败')}finally{setSaving(false)}
  }
  return <Dialog open onOpenChange={open=>{if(!open&&!saving)onClose()}}><DialogContent className="max-h-[90dvh] overflow-y-auto p-6 sm:max-w-2xl">
    <DialogHeader><DialogTitle className="text-xl">研究设置</DialogTitle><DialogDescription>{profile.name} · 设置用于下一轮分析，不改写已归档证据。</DialogDescription></DialogHeader>
    <div className="flex gap-2 rounded-xl bg-muted/60 p-1">{[{id:'scope',label:'研究范围',icon:Settings2},{id:'rules',label:'决策规则',icon:ShieldCheck},{id:'schedule',label:'自动复核',icon:Clock3}].map(({id,label,icon:Icon})=><Button key={id} variant={section===id?'secondary':'ghost'} className="min-h-11 flex-1" aria-pressed={section===id} onClick={()=>setSection(id)}><Icon className="size-4"/>{label}</Button>)}</div>
    {section==='scope'&&<div className="space-y-5 py-2"><div className="grid gap-4 sm:grid-cols-2"><div className="space-y-2"><Label htmlFor="settings-benchmark">市场基准</Label><Input id="settings-benchmark" value={draft.benchmark} onChange={e=>setDraft({...draft,benchmark:e.target.value})}/><p className="text-xs text-muted-foreground">例如 000300.SH；没有订阅行情时会提示缺口。</p></div><div className="space-y-2"><Label htmlFor="settings-horizon">观察周期（交易日）</Label><Input id="settings-horizon" type="number" min={1} max={120} value={draft.horizonDays} onChange={e=>setDraft({...draft,horizonDays:Number(e.target.value)})}/></div></div><div className="space-y-2"><Label htmlFor="settings-sectors">关注的资金板块</Label><Input id="settings-sectors" value={sectors} onChange={e=>setSectors(e.target.value)} placeholder="半导体，通信设备"/><p className="text-xs text-muted-foreground">用逗号分隔，须与数据订阅中的板块名称一致。</p></div><label className="flex items-start gap-3 rounded-xl border p-4"><input type="checkbox" className="mt-1 size-4 accent-primary" checked={allowPortfolio} disabled={!aiDestination} onChange={e=>setAllowPortfolio(e.target.checked)}/><span><span className="block text-sm font-medium">本次新建分析允许私有持仓解读</span><span className="mt-1 block text-xs leading-5 text-muted-foreground">仅在下一次手动完整分析中，将持仓名称、代码与权重发送至 {aiDestination||'未配置智能分析目的地'}；不发送金额、邮箱或份额，也不进入公开报告。启动后本授权自动清除。</span></span></label><details className="rounded-xl border p-4"><summary className="cursor-pointer font-medium">产业环节与领先企业 · 高级映射</summary><p className="my-3 text-xs leading-5 text-muted-foreground">每个细分环节包含名称和企业代码；领先企业包含代码、名称和所属环节。领先企业可独立于指数基金持仓。</p><Label htmlFor="settings-mapping" className="sr-only">产业映射结构化数据</Label><textarea id="settings-mapping" value={advanced} onChange={e=>setAdvanced(e.target.value)} className="min-h-48 w-full rounded-lg border bg-background p-3 font-mono text-sm focus-visible:outline-2 focus-visible:outline-ring"/></details></div>}
    {section==='rules'&&<div className="space-y-4 py-2"><p className="rounded-xl bg-amber-500/10 p-3 text-sm leading-6 text-amber-800 dark:text-amber-300">这些是实验性筛选条件，不是经过样本外验证的收益承诺。缺失数据不会被当成满足条件。</p><div className="grid gap-4 sm:grid-cols-2">{(Object.keys(labels) as Array<keyof Profile['rules']>).map(key=><div key={key} className="space-y-2"><Label htmlFor={'setting-'+key}>{labels[key]}</Label><Input id={'setting-'+key} type="number" value={draft.rules[key]} onChange={e=>setDraft({...draft,rules:{...draft.rules,[key]:Number(e.target.value)}})}/></div>)}</div></div>}
    {section==='schedule'&&<div className="space-y-5 py-2"><label className="flex min-h-14 items-center justify-between gap-4 rounded-xl border p-4"><span><span className="block font-medium">盘前 / 盘后规则复核</span><span className="mt-1 block text-xs text-muted-foreground">默认关闭。不会自动调用智能分析、发布或交易。</span></span><input type="checkbox" checked={enabled} onChange={e=>setEnabled(e.target.checked)} className="size-5 accent-primary"/></label><div className="space-y-2"><Label htmlFor="settings-times">北京时间</Label><Input id="settings-times" value={times} onChange={e=>setTimes(e.target.value)} placeholder="08:50，19:30"/></div><p className="text-sm leading-6 text-muted-foreground">依赖本地数据服务。规则复核也会进入统一执行历史，保存新的证据版本；需要智能解读时，再手动启动完整复核。</p></div>}
    {error&&<p role="alert" className="rounded-lg bg-destructive/10 p-3 text-sm text-destructive">{error}</p>}
    <DialogFooter className="-mx-6 -mb-6 mt-2 p-6"><Button variant="outline" onClick={onClose} disabled={saving}>取消</Button><Button onClick={()=>void save()} disabled={saving}>{saving?'正在保存…':'保存设置'}</Button></DialogFooter>
  </DialogContent></Dialog>
}
