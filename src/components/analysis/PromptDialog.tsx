'use client'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogTrigger } from '@/components/ui/dialog'
export function PromptDialog({ artifacts }: { artifacts: Array<{ artifactKey: string; data?: unknown }> }) {
  const [copyStatus, setCopyStatus] = useState('')
  const artifact = artifacts.find(row => row.artifactKey === 'ai-prompt')
  let prompt: any = artifact?.data
  let audit: any = artifacts.find(row => row.artifactKey === 'ai-input-audit')?.data
  if (typeof audit === 'string') { try { audit = JSON.parse(audit) } catch { audit = null } }
  if (typeof prompt === 'string') { try { prompt = JSON.parse(prompt) } catch { prompt = { messages: [{content:prompt}] } } }
  return <Dialog><DialogTrigger render={<Button size="sm" variant="outline" disabled={!artifact} />}>查看分析输入</DialogTrigger>
    <DialogContent className="flex max-h-[85vh] min-w-0 flex-col overflow-hidden sm:max-w-4xl">
      <DialogHeader className="shrink-0 pr-8"><DialogTitle>本次实际发送的分析输入</DialogTitle><DialogDescription>生成前保存，可用于核对输入和迭代；私有持仓步骤可能包含个人投资信息，请勿公开分享。</DialogDescription></DialogHeader>
      <div className="flex shrink-0 flex-wrap items-center justify-between gap-3"><p className="text-xs text-muted-foreground">模型 {prompt?.model || '—'} · {prompt?.capturedAt || ''}</p><Button size="sm" onClick={async () => { try { await navigator.clipboard.writeText(JSON.stringify(prompt,null,2)); setCopyStatus('已复制') } catch { setCopyStatus('复制失败，请手动选择正文') } }}>复制分析输入</Button></div>
      {copyStatus && <p role="status" className="text-xs">{copyStatus}</p>}
      {audit && <p className="rounded border px-3 py-2 text-xs" role="status">{audit.passed ? '输入结构审计通过' : '输入结构审计未通过'} · {audit.characters} 字符 · {audit.numericValues} 个结构化数值 · 未展开占位 {audit.unexpandedPlaceholders?.length || 0}。结构通过不代表来源事实已获独立验证。</p>}
      <div className="min-h-0 min-w-0 space-y-3 overflow-y-auto"><h3 className="font-semibold">系统要求</h3><pre className="min-w-0 whitespace-pre-wrap rounded-lg bg-muted p-3 text-xs leading-6 [overflow-wrap:anywhere]">{prompt?.system}</pre><h3 className="font-semibold">研究证据</h3><pre className="min-w-0 whitespace-pre-wrap rounded-lg bg-muted p-3 text-xs leading-6 [overflow-wrap:anywhere]">{prompt?.messages?.map((row: any) => row.content).join('\n\n')}</pre></div>
    </DialogContent>
  </Dialog>
}
