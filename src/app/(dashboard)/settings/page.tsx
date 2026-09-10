'use client'

import { useCallback, useEffect, useState } from 'react'
import { Settings2, Check, Loader2, Eye, EyeOff } from 'lucide-react'
import { AI_SCENES, type DisplayAISetting } from '@/lib/ai/scene-catalog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'

type Draft = DisplayAISetting & { initialApiKey: string; resetToken: boolean; tokenVisible: boolean }
export default function SettingsPage() {
  const [rows, setRows] = useState<Draft[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [saved, setSaved] = useState(false)
  const [dirty, setDirty] = useState(false)
  const apply = useCallback((settings: DisplayAISetting[]) => {
    setRows(settings.map(row => ({ ...row, initialApiKey: row.apiKey, resetToken: false, tokenVisible: true })))
    setDirty(false)
  }, [])
  const load = useCallback(() => fetch('/api/settings/ai', { cache: 'no-store' })
    .then(response => {
      if (!response.ok) throw new Error('设置加载失败，请重试')
      return response.json()
    })
    .then(data => apply(data.settings))
    .catch(e => setError(e instanceof Error ? e.message : '设置加载失败'))
    .finally(() => setLoading(false)), [apply])
  useEffect(() => { void load() }, [load])
  useEffect(() => {
    if (!dirty) return
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = '' }
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [dirty])
  function update(index: number, patch: Partial<Draft>) {
    setRows(old => old.map((row, i) => i === index ? { ...row, ...patch } : row))
    setDirty(true); setSaved(false); setError('')
  }
  async function save(event: React.FormEvent) {
    event.preventDefault(); setSaving(true); setError(''); setSaved(false)
    try {
      const response = await fetch('/api/settings/ai', {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ settings: rows.map(({ scene, model, maxTokens, apiKey, initialApiKey, resetToken }) => ({ scene, model: model.trim(), maxTokens, ...(apiKey.trim() && apiKey.trim() !== initialApiKey ? { apiKey: apiKey.trim() } : {}), resetToken })) }),
      })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || '配置保存失败')
      apply(data.settings); setSaved(true)
    } catch (e) { setError(e instanceof Error ? e.message : '配置保存失败，请重试') }
    finally { setSaving(false) }
  }
  return <div className="mx-auto w-full max-w-5xl space-y-6 p-4 md:p-6">
    <div className="flex items-start gap-3">
      <Settings2 className="mt-1 h-6 w-6 shrink-0 text-primary" aria-hidden="true" />
      <div><h1 className="text-2xl font-semibold tracking-tight">AI 设置</h1><p className="mt-2 text-sm leading-6 text-muted-foreground">按使用场景配置模型、API Token 和输出长度。保存后，后续 AI 请求使用新配置。</p></div>
    </div>
    <div className="rounded-xl border bg-muted/40 p-4 text-sm leading-6 text-muted-foreground">API Token 显示当前生效的密钥，可直接修改或切换显示与隐藏。留空保留当前密钥；未单独配置时继承全局密钥。输出 Token 上限控制单次回答长度。配置写入根目录 .env，API 地址沿用全局设置。</div>
    {error && <div role="alert" className="rounded-lg border border-destructive/40 p-4 text-sm text-destructive">{error}{rows.length === 0 && <Button type="button" variant="outline" className="ml-3 min-h-11" onClick={() => { setError(''); setLoading(true); void load() }}>重试</Button>}</div>}
    {loading ? <div role="status" className="flex items-center gap-2 py-12 text-muted-foreground"><Loader2 className="h-5 w-5 animate-spin motion-reduce:animate-none" />正在读取配置…</div> : rows.length > 0 && <form onSubmit={save} className="space-y-5">
      <fieldset disabled={saving} className="space-y-5 disabled:opacity-70">
        {rows.map((row, index) => <Card key={row.scene}>
          <CardHeader><CardTitle className="text-lg">{AI_SCENES[row.scene].label}</CardTitle><CardDescription className="leading-6">{AI_SCENES[row.scene].description}</CardDescription></CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2"><Label htmlFor={`${row.scene}-model`}>模型名称</Label><Input id={`${row.scene}-model`} className="min-h-11 text-foreground" value={row.model} required maxLength={200} pattern="[a-zA-Z0-9][a-zA-Z0-9._:/\-]*" onChange={e => update(index, { model: e.target.value })} list="ai-models" /></div>
              <div className="space-y-2"><Label htmlFor={`${row.scene}-budget`}>输出 Token 上限</Label><Input id={`${row.scene}-budget`} className="min-h-11 text-foreground" type="number" min={256} max={65536} step={1} required value={Number.isNaN(row.maxTokens) ? '' : row.maxTokens} onChange={e => update(index, { maxTokens: e.target.valueAsNumber })} /></div>
            </div>
            <div className="space-y-2"><Label htmlFor={`${row.scene}-token`}>API Token <span className="font-normal text-muted-foreground">{row.resetToken ? '保存后恢复全局密钥' : row.tokenSource === 'scene' ? '已配置独立密钥' : row.tokenSource === 'global' ? '继承全局密钥' : '尚未配置'}</span></Label>
              <div className="flex items-center gap-2"><Input id={`${row.scene}-token`} className="min-h-11 text-foreground" type={row.tokenVisible ? 'text' : 'password'} autoComplete="new-password" spellCheck={false} value={row.apiKey} placeholder="输入新密钥以替换，留空保持不变" onChange={e => update(index, { apiKey: e.target.value, resetToken: false })} /><Button type="button" variant="outline" className="min-h-11 min-w-11 shrink-0" aria-label={`${row.tokenVisible ? '隐藏' : '显示'}${AI_SCENES[row.scene].label} API Token`} aria-pressed={row.tokenVisible} onClick={() => setRows(old => old.map((item, i) => i === index ? { ...item, tokenVisible: !item.tokenVisible } : item))}>{row.tokenVisible ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}</Button></div>
              {row.tokenSource === 'scene' && <Button type="button" variant="outline" className="min-h-11" onClick={() => update(index, { resetToken: !row.resetToken, apiKey: row.resetToken ? row.initialApiKey : '' })}>{row.resetToken ? '取消恢复全局密钥' : '恢复使用全局密钥'}</Button>}
            </div>
            <details className="rounded-lg border"><summary className="min-h-11 cursor-pointer px-3 py-3 text-sm text-muted-foreground">查看使用位置</summary><ul className="space-y-2 border-t px-4 py-3 text-sm text-muted-foreground">{AI_SCENES[row.scene].entries.map(entry => <li className="break-words" key={entry}>{entry}</li>)}</ul></details>
          </CardContent>
        </Card>)}
      </fieldset>
      <datalist id="ai-models"><option value="claude-sonnet-5" /><option value="claude-opus-5" /></datalist>
      <div className="sticky bottom-0 flex flex-wrap items-center justify-between gap-3 rounded-xl border bg-background/95 p-4 backdrop-blur">
        <p role="status" className="flex items-center gap-2 text-sm text-muted-foreground">{saved ? <><Check className="h-4 w-4" />已保存，后续请求生效</> : dirty ? '有未保存的修改' : '当前显示各场景生效的配置'}</p>
        <Button type="submit" className="min-h-11" disabled={saving || !dirty}>{saving && <Loader2 className="mr-2 h-4 w-4 animate-spin motion-reduce:animate-none" />}{saving ? '正在保存…' : '保存配置'}</Button>
      </div>
    </form>}
  </div>
}
