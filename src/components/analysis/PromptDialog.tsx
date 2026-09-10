'use client'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogTrigger } from '@/components/ui/dialog'
import { MessageContentView } from './StructuredDataView'
import { displayValue } from '@/lib/analysis/structured-data'
type Row=Record<string,unknown>
const record=(value:unknown):Row=>value&&typeof value==='object'&&!Array.isArray(value)?value as Row:{}
export function PromptDialog({ artifacts }: { artifacts: Array<{ artifactKey: string; data?: unknown }> }) {
  const [copyStatus, setCopyStatus] = useState('')
  const artifact = artifacts.find(row => row.artifactKey === 'ai-prompt')
  let prompt:Row=record(artifact?.data)
  let audit:Row=record(artifacts.find(row => row.artifactKey === 'ai-input-audit')?.data)
  if (typeof artifacts.find(row => row.artifactKey === 'ai-input-audit')?.data === 'string') { try { audit = record(JSON.parse(String(artifacts.find(row => row.artifactKey === 'ai-input-audit')?.data))) } catch { audit = {} } }
  if (typeof artifact?.data === 'string') { try { prompt = record(JSON.parse(artifact.data)) } catch { prompt = { messages: [{content:artifact.data}] } } }
  const messages=Array.isArray(prompt.messages)?prompt.messages.map(record):[]
  return <Dialog><DialogTrigger render={<Button size="sm" variant="outline" disabled={!artifact} />}>查看分析输入</DialogTrigger>
    <DialogContent className="flex max-h-[85vh] min-w-0 flex-col overflow-hidden sm:max-w-4xl">
      <DialogHeader className="shrink-0 pr-8"><DialogTitle>本次实际发送的分析输入</DialogTitle><DialogDescription>生成前保存，可用于核对输入和迭代；私有持仓步骤可能包含个人投资信息，请勿公开分享。</DialogDescription></DialogHeader>
      <div className="flex shrink-0 flex-wrap items-center justify-between gap-3"><p className="text-xs text-muted-foreground">模型 {String(prompt.model || '—')} · {String(prompt.capturedAt || '')}</p><Button size="sm" onClick={async () => { try { await navigator.clipboard.writeText(JSON.stringify(prompt,null,2)); setCopyStatus('已复制') } catch { setCopyStatus('复制失败，请手动选择正文') } }}>复制分析输入</Button></div>
      {copyStatus && <p role="status" className="text-xs">{copyStatus}</p>}
      {Object.keys(audit).length>0 && <p className="rounded border px-3 py-2 text-xs" role="status">{audit.passed ? '输入结构审计通过' : '输入结构审计未通过'} · {String(audit.characters??'—')} 字符 · {String(audit.numericValues??'—')} 个结构化数值 · 未展开占位 {Array.isArray(audit.unexpandedPlaceholders)?audit.unexpandedPlaceholders.length:0}。结构通过不代表来源事实已获独立验证。</p>}
      <div className="min-h-0 min-w-0 space-y-4 overflow-y-auto"><section><h3 className="mb-2 font-semibold">系统角色提示</h3><div className="rounded-lg border bg-muted/20 p-3"><MessageContentView content={prompt.system} prompt/></div></section><section><h3 className="mb-2 font-semibold">用户正文与数据</h3><div className="space-y-3 rounded-lg border bg-muted/20 p-3">{messages.map((row,index)=><div key={index}><p className="mb-2 text-xs text-muted-foreground">角色：{displayValue(row.role||'user')}</p><MessageContentView content={row.content} prompt/></div>)}</div></section></div>
    </DialogContent>
  </Dialog>
}
