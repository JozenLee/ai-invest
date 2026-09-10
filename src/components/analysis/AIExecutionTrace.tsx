'use client'

import { useState } from 'react'
import { Bot, CircleAlert, MessageSquareText, ShieldCheck } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { MessageContentView, StructuredDataView } from './StructuredDataView'
import { displayValue, isRecord, parseStructuredValue } from '@/lib/analysis/structured-data'

type Artifact = { artifactKey: string; data?: unknown }
const record = (value: unknown) => { const parsed = parseStructuredValue(value); return isRecord(parsed) ? parsed : {} }

export function AIExecutionTrace({ artifacts, stepName }: { artifacts: Artifact[]; stepName?:string }) {
  const attempts = [...new Set(artifacts.flatMap(item => { const match = item.artifactKey.match(/^ai-(?:request|response|error)-attempt-(\d+)$/); return match ? [Number(match[1])] : [] }))].sort((a, b) => a - b)
  const [selected, setSelected] = useState<number | null>(null)
  const [panel, setPanel] = useState('input')
  const attempt = selected ?? attempts.at(-1)
  const find = (key: string) => artifacts.find(item => item.artifactKey === key)?.data
  const promptData = attempt ? find(`ai-request-attempt-${attempt}`) : find('ai-prompt')
  const prompt = record(promptData)
  const responseData = attempt ? find(`ai-response-attempt-${attempt}`) : find('ai-response')
  const response = record(responseData)
  const status = record(find('ai-request-status'))
  const failure = record(attempt ? find(`ai-error-attempt-${attempt}`) : undefined)
  const usage = record(response.usage)
  const messages = Array.isArray(prompt.messages) ? prompt.messages.map(record) : []
  const responseBlocks = Array.isArray(response.content) ? response.content.filter(block => isRecord(block) && block.type === 'text') : []
  const adopted=find(stepName==='portfolio-decision'?'portfolio-analysis':stepName||'')
  const portfolioSupport=stepName==='portfolio-decision'?find('portfolio-decision-support'):undefined
  const moduleStatus = record(artifacts.find(item => item.artifactKey.endsWith('-ai-status'))?.data)
  if (promptData == null && responseData == null && !attempts.length) return <section className="rounded-2xl border bg-card p-5"><div className="flex items-center gap-2"><ShieldCheck className="size-5 text-primary" /><h2 className="font-semibold">执行方式</h2><Badge variant="secondary">{moduleStatus.status === 'deterministic' ? '确定性规则 / 汇编' : '未归档模型调用'}</Badge></div><p className="mt-3 text-sm leading-7 text-muted-foreground">{String(moduleStatus.reason || '本步骤没有已归档的模型请求与回复；请核对下方规则结果及上游依赖。')}</p></section>
  return <section className="min-w-0 overflow-hidden rounded-2xl border bg-card">
    <div className="flex flex-wrap items-start justify-between gap-4 border-b px-4 py-3"><div className="flex gap-3"><span className="h-fit rounded-xl bg-primary/10 p-2.5 text-primary"><Bot className="size-5" /></span><div><h2 className="text-lg font-semibold">模型执行明细</h2><p className="mt-1 text-sm leading-6 text-muted-foreground">按同一次请求核对输入与回复，再与最终采用结果对照。</p></div></div>{attempts.length > 0 && <label className="flex items-center gap-2 text-sm">请求轮次<select aria-label="请求轮次" value={attempt} onChange={event => setSelected(Number(event.target.value))} className="min-h-11 rounded-lg border bg-background px-3">{attempts.map(number => <option key={number} value={number}>第 {number} 次请求{find(`ai-error-attempt-${number}`) ? ' · 异常' : ''}</option>)}</select></label>}</div>
    <div className="space-y-4 p-4">
      {Object.keys(failure).length > 0 && <div role="alert" className="flex gap-3 rounded-xl border border-destructive/30 bg-destructive/5 p-4 text-sm"><CircleAlert className="size-5 shrink-0 text-destructive" /><div><p className="font-semibold text-destructive">本次请求异常</p><p className="mt-1 break-words leading-6">{displayValue(failure.message)}</p></div></div>}
      {moduleStatus.status === 'fallback' && <p role="status" className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-4 text-sm leading-6">最终结果已降级：{displayValue(moduleStatus.reason)}。本次模型回复不等于最终采用结果。</p>}
      <dl className="grid gap-4 rounded-xl bg-muted/30 p-4 sm:grid-cols-3"><div><dt className="text-xs text-muted-foreground">调用模型</dt><dd className="mt-1 break-all text-sm font-medium">{String(response.model || prompt.model || '未记录')}</dd></div><div><dt className="text-xs text-muted-foreground">输入 / 输出用量</dt><dd className="mt-1 text-sm font-medium tabular-nums">{displayValue(usage.input_tokens)} / {displayValue(usage.output_tokens)}</dd></div><div><dt className="text-xs text-muted-foreground">返回状态</dt><dd className="mt-1 text-sm font-medium">{response.stop_reason ? displayValue(response.stop_reason) : responseData ? '回复已归档' : Object.keys(failure).length ? '请求失败' : attempt === attempts.at(-1) ? displayValue(status.status) || '尚无回复' : '尚无回复'}</dd></div></dl>
      <div role="tablist" aria-label="模型输入输出" className="flex gap-1 rounded-xl bg-muted/40 p-1">{[['input','输入提示与数据'],['response','模型回复']].map(([key, title]) => <button key={key} id={`trace-tab-${key}`} role="tab" aria-selected={panel === key} aria-controls={`trace-panel-${key}`} tabIndex={panel === key ? 0 : -1} onKeyDown={event => { if (['ArrowLeft','ArrowRight','Home','End'].includes(event.key)) { event.preventDefault(); const next = event.key === 'Home' ? 'input' : event.key === 'End' ? 'response' : key === 'input' ? 'response' : 'input'; setPanel(next); document.getElementById(`trace-tab-${next}`)?.focus() } }} onClick={() => setPanel(key)} className={`min-h-11 flex-1 rounded-lg px-4 text-sm font-medium focus-visible:outline-2 focus-visible:outline-primary ${panel === key ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}>{title}</button>)}</div>
      <div role="tabpanel" id={`trace-panel-${panel}`} aria-labelledby={`trace-tab-${panel}`} className="min-w-0 space-y-5">
        {panel === 'input' ? <><section className="rounded-xl border p-4"><h3 className="mb-4 flex items-center gap-2 font-semibold"><ShieldCheck className="size-4 text-primary" />系统角色提示</h3>{prompt.system ? <MessageContentView content={prompt.system} prompt /> : <p className="text-sm text-muted-foreground">本次未记录独立系统角色提示。</p>}</section>{messages.map((message, index) => <section key={index} className="rounded-xl border p-4"><h3 className="mb-4 flex items-center gap-2 font-semibold"><MessageSquareText className="size-4 text-primary" />任务正文与数据<Badge variant="secondary">{displayValue(message.role || 'user')} · 第 {index + 1} 条</Badge></h3><MessageContentView content={message.content} prompt /></section>)}{!messages.length && <p className="text-sm text-muted-foreground">本次请求未归档输入正文。</p>}</> : moduleStatus.status==='fallback'&&adopted ? <section className="space-y-3"><h3 className="text-sm font-semibold">模型未完成 · 本地回退结果</h3><StructuredDataView value={adopted}/>{responseBlocks.length>0&&<details className="rounded-xl border"><summary className="min-h-11 cursor-pointer p-3 text-sm">核对未采用的模型回复</summary><div className="border-t p-3">{responseBlocks.map((block,index)=><MessageContentView key={index} content={record(block).text}/>)}</div></details>}</section> : responseBlocks.length ? responseBlocks.map((block, index) => <MessageContentView key={`${attempt}-${index}`} content={record(block).text} />) : <p className="rounded-xl border border-dashed p-5 text-sm text-muted-foreground">{responseData ? '本次回复没有可展示的文本结果。' : '本次请求尚无已归档回复。'}</p>}
      </div>
      {panel==='response'&&portfolioSupport!=null&&<details className="rounded-xl border"><summary className="min-h-11 cursor-pointer px-4 py-3 text-sm font-medium">本地仓位测算与执行门禁</summary><div className="border-t p-4"><StructuredDataView value={portfolioSupport}/></div></details>}
      <details className="rounded-xl border"><summary className="min-h-11 cursor-pointer px-4 py-3 text-sm text-muted-foreground">请求参数与输入校验</summary><div className="border-t p-4"><StructuredDataView value={{ max_tokens:prompt.max_tokens, temperature:prompt.temperature, effort:prompt.effort, capturedAt:prompt.capturedAt, validation:find('ai-input-audit') }} /></div></details>
    </div>
  </section>
}
