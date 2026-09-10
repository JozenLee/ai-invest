'use client'

import { readableResearchData } from '@/lib/analysis/readable-data'
import { useState, type ReactNode } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { ChevronDown } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cleanStructuredValue, displayValue, fieldLabel, isRecord, parseStructuredValue, splitStructuredContent } from '@/lib/analysis/structured-data'
export { parseStructuredValue } from '@/lib/analysis/structured-data'

const primitive = (value: unknown) => value == null || typeof value !== 'object'

function PageItems({ count, children }: { count: number; children: (start: number, end: number) => ReactNode }) {
  const [page, setPage] = useState(0)
  const current = Math.min(page, Math.max(0, Math.ceil(count / 12) - 1))
  const start = current * 12
  return <div className="min-w-0 space-y-3">{children(start, start + 12)}{count > 12 && <div className="flex flex-wrap items-center justify-between gap-2 border-t pt-3"><span className="text-xs text-muted-foreground" role="status">第 {start + 1}—{Math.min(start + 12, count)} 条，共 {count} 条</span><div className="flex gap-2"><Button variant="outline" size="sm" disabled={current === 0} onClick={() => setPage(current - 1)}>上一页</Button><Button variant="outline" size="sm" disabled={start + 12 >= count} onClick={() => setPage(current + 1)}>下一页</Button></div></div>}</div>
}

function Fields({ entries }: { entries: Array<[string, unknown]> }) {
  return <dl className="grid min-w-0 gap-x-6 gap-y-4 @md:grid-cols-2 @3xl:grid-cols-3">{entries.map(([key, value]) => <div key={key} className={`min-w-0 border-b border-border/60 pb-3 ${typeof value === 'string' && (value.length > 55 || ['analysis','conclusion','thesis','reason','boundary','analysisFocus','mappingLimit','evidenceBoundary'].includes(key)) ? '@md:col-span-2 @3xl:col-span-3' : ''}`}><dt title={key} className="text-xs leading-5 text-muted-foreground">{fieldLabel(key)}</dt><dd className="mt-1 whitespace-pre-wrap break-words text-sm leading-7 tabular-nums [overflow-wrap:anywhere]">{displayValue(value)}</dd></div>)}</dl>
}

function ArrayView({ rows, depth }: { rows: unknown[]; depth: number }) {
  const records = rows.filter(isRecord)
  const columns = [...new Set(records.flatMap(row => Object.keys(row)))]
  const table = records.length === rows.length && columns.length <= 6 && records.every(row => Object.values(row).every(primitive))
  return <PageItems count={rows.length}>{(start, end) => table ? <>
    <div className="hidden overflow-x-auto rounded-xl border md:block"><table className="w-full text-left text-sm"><caption className="sr-only">数据明细，共 {rows.length} 条</caption><thead className="bg-muted/50"><tr>{columns.map(key => <th key={key} title={key} className="min-w-24 px-4 py-3 font-medium text-muted-foreground">{fieldLabel(key)}</th>)}</tr></thead><tbody className="divide-y">{records.slice(start, end).map((row, index) => <tr key={start + index} className="align-top hover:bg-muted/20">{columns.map(key => <td key={key} className="max-w-sm whitespace-pre-wrap break-words px-4 py-3 leading-6 [overflow-wrap:anywhere]">{displayValue(row[key])}</td>)}</tr>)}</tbody></table></div>
    <div className="space-y-3 md:hidden">{records.slice(start, end).map((row, index) => <div key={start + index} className="rounded-xl border p-4"><Fields entries={Object.entries(row)} /></div>)}</div>
  </> : <div className="space-y-3">{rows.slice(start, end).map((item, index) => <section key={start + index} className="min-w-0 rounded-xl border bg-background p-4">{isRecord(item) && <div className="mb-4 flex items-center gap-3 border-b pb-3"><span className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-muted text-xs tabular-nums">{start + index + 1}</span><h4 className="break-words text-sm font-semibold">{displayValue(item.name || item.title || item.ticker || item.code || item.label) || '明细记录'}</h4></div>}<DataView value={item} depth={depth + 1} /></section>)}</div>}</PageItems>
}

function DataView({ value, depth }: { value: unknown; depth: number }) {
  if (typeof value === 'string') return <div className="min-w-0 whitespace-pre-wrap break-words text-sm leading-7 [overflow-wrap:anywhere]">{displayValue(value)}</div>
  if (primitive(value)) return <p className="text-sm leading-7">{displayValue(value)}</p>
  if (Array.isArray(value)) return <ArrayView rows={value} depth={depth} />
  if (!isRecord(value)) return null
  const entries = Object.entries(value)
  return <div className="@container min-w-0 space-y-5"><Fields entries={entries.filter(([, item]) => primitive(item))} />{entries.filter(([, item]) => !primitive(item)).map(([key, item]) => <DataSection key={key} name={key} value={item} depth={depth} />)}</div>
}

function DataSection({ name, value, depth }: { name: string; value: unknown; depth: number }) {
  const [open, setOpen] = useState(depth < 1)
  return <details open={open} onToggle={event => setOpen(event.currentTarget.open)} className="min-w-0 rounded-xl border bg-background"><summary className="flex min-h-12 cursor-pointer items-center justify-between gap-3 rounded-xl px-4 py-3 text-sm font-semibold hover:bg-muted/30 focus-visible:outline-2 focus-visible:outline-primary"><span title={name}>{fieldLabel(name)}</span><span className="flex items-center gap-2 text-xs font-normal text-muted-foreground">{Array.isArray(value) ? `${value.length} 条记录` : '展开明细'}<ChevronDown className={`size-4 transition-transform motion-reduce:transition-none ${open ? 'rotate-180' : ''}`} /></span></summary>{open && <div className="min-w-0 border-t p-4"><DataView value={value} depth={depth + 1} /></div>}</details>
}

export function StructuredDataView({ value, depth = 0 }: { value: unknown; depth?: number }) {
  const cleaned = cleanStructuredValue(readableResearchData(parseStructuredValue(value)))
  if (cleaned === undefined) return <p className="rounded-xl border border-dashed p-4 text-sm text-muted-foreground">暂无有效数据</p>
  return <DataView value={cleaned} depth={depth} />
}

/** Prompt text is kept verbatim; labels are Chinese, identifiers remain auditable. */
export function MessageContentView({ content, prompt = false }: { content: unknown; prompt?: boolean }) {
  if (Array.isArray(content)) return <div className="space-y-4">{content.map((block, index) => isRecord(block) && block.type === 'text' ? <MessageContentView key={index} content={block.text} prompt={prompt} /> : <div key={index} className="rounded-lg border p-3"><p className="mb-2 text-xs text-muted-foreground">非文本内容</p><StructuredDataView value={block} /></div>)}</div>
  if (typeof content !== 'string') return <StructuredDataView value={content} />
  const decoded = parseStructuredValue(content)
  if (typeof decoded !== 'string') return <StructuredDataView value={decoded} />
  return <div className="space-y-4">{splitStructuredContent(content).map((section, index) => section.kind === 'data' ? <section key={index} className="rounded-xl border bg-muted/10 p-4"><h4 className="mb-4 text-sm font-semibold">结构化数据</h4><StructuredDataView value={section.value} /></section> : section.kind === 'invalid' ? <div key={index} role="alert" className="rounded-xl border border-destructive/30 bg-destructive/5 p-4"><p className="text-sm font-medium text-destructive">数据格式异常，无法完整解析</p><p className="mt-1 text-xs text-muted-foreground">请核对本次回复是否被截断；以下内容保留用于排查。</p><pre className="mt-3 max-h-80 overflow-auto whitespace-pre-wrap break-all text-xs leading-6">{String(section.value)}</pre></div> : <div key={index} className="min-w-0 break-words text-sm leading-7 [overflow-wrap:anywhere] [&_li]:ml-5 [&_li]:list-disc [&_p+p]:mt-3 [&_pre]:overflow-auto [&_table]:block [&_table]:overflow-auto [&_td]:border [&_td]:p-2 [&_th]:border [&_th]:p-2"><ReadableText text={String(section.value)} prompt={prompt} /></div>)}</div>
}

function ReadableText({text, prompt}:{text:string;prompt:boolean}) {
  if (!prompt) return <ReactMarkdown remarkPlugins={[remarkGfm]}>{text}</ReactMarkdown>
  const readable = text.replace(/[A-Za-z][A-Za-z0-9_]*/g, token => {
    if (token === 'JSON') return '结构化数据'
    if (token === 'ETF') return '指数基金'
    if (token === 'AI') return '人工智能'
    const translated = fieldLabel(token)
    return translated === '扩展信息' ? token : translated
  })
  const schemaStart = readable.indexOf('输出结构化数据：')
  const narrative = schemaStart < 0 ? readable : readable.slice(0, schemaStart)
  return <div className="space-y-3"><ReactMarkdown remarkPlugins={[remarkGfm]}>{narrative.replace(/。(?=[^\n])/g, '。\n\n')}</ReactMarkdown>{schemaStart >= 0 && <details className="rounded-lg border bg-muted/20"><summary className="min-h-11 cursor-pointer px-3 py-2 text-sm font-medium">输出结构与格式约定</summary><div className="whitespace-pre-wrap border-t p-3 text-sm leading-7">{readable.slice(schemaStart).replace(/([{},])/g, '$1\n')}</div></details>}{readable !== text && <details className="rounded-lg border"><summary className="min-h-11 cursor-pointer px-3 py-2 text-xs text-muted-foreground">当前为中文阅读视图 · 核对实际发送原文</summary><pre className="max-h-80 overflow-auto whitespace-pre-wrap break-words border-t p-3 text-xs leading-6">{text}</pre></details>}</div>
}
