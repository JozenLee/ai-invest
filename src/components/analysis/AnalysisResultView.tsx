import ReactMarkdown from 'react-markdown'
import { analysisFieldLabels, chineseNarrative, chineseValue } from '@/lib/analysis/chinese-labels'

export function AnalysisResultView({ value }: { value: unknown }) {
  let parsed = value
  if (typeof value === 'string') {
    try { parsed = JSON.parse(value.trim().replace(/^```(?:json)?\s*/, '').replace(/\s*```$/, '')) } catch { /* Plain Markdown is also valid. */ }
  }
  if (typeof parsed === 'string') return <div className="space-y-4 text-sm leading-7"><ReactMarkdown>{chineseNarrative(parsed)}</ReactMarkdown></div>
  if (typeof parsed === 'number' || typeof parsed === 'boolean') return <p className="text-sm">{String(parsed)}</p>
  if (!parsed || typeof parsed !== 'object') return <p className="text-muted-foreground">暂无有效分析</p>
  return <div className="space-y-5">{Object.entries(parsed).map(([key, item]) => <section key={key}><h3 className="mb-2 text-sm font-semibold">{analysisFieldLabels[key] || '补充信息'}</h3>{typeof item === 'string' ? <div className="text-sm leading-7"><ReactMarkdown>{chineseNarrative(item)}</ReactMarkdown></div> : Array.isArray(item) ? <ul className="list-disc space-y-3 pl-5 text-sm leading-7">{item.map((entry, i) => <li key={i}><AnalysisResultView value={entry} /></li>)}</ul> : item && typeof item === 'object' ? <div className="border-l-2 border-primary/15 pl-4"><AnalysisResultView value={item} /></div> : <p className="text-sm">{item == null ? '未提供' : String(chineseValue(item))}</p>}</section>)}</div>
}
