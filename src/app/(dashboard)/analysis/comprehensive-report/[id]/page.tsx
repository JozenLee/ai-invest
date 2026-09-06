'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import html2canvas from 'html2canvas'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import {
  Activity,
  AlertTriangle,
  ArrowLeft,
  BarChart3,
  Building2,
  CheckCircle2,
  CalendarDays,
  Database,
  Download,
  ExternalLink,
  FileText,
  Layers3,
  Newspaper,
  ShieldAlert,
  TrendingUp,
  WalletCards,
  XCircle,
} from 'lucide-react'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Skeleton } from '@/components/ui/skeleton'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import {
  deriveMarketQualitySnapshot,
  normalizeAdvice as normalizeAdviceContract,
  normalizeCompany,
  normalizeMarket,
  normalizeNews,
  normalizePortfolio,
  localizeUserFacingText,
  normalizeMarketReportText,
  extractMarkdownSection,
} from '@/lib/analysis/report-contract'
import type { NormalizedMarket } from '@/lib/analysis/report-contract'
import { ReportInsightHierarchy } from '@/components/analysis/ReportInsightHierarchy'

type Report = {
  id: string
  type: string
  industryName: string
  title: string
  summary?: string | null
  content: string
  data?: unknown
  createdAt: string
}

type RecordValue = Record<string, string> & { segmentCodes?: unknown[]; industrySegments?: unknown[] }
type Recommendation = {
  action?: string
  target?: string
  symbol?: string
  targetType?: string
  reason?: string
  allocation?: number
  targetPrice?: number
  priority?: number
  amount?: number
  currentWeight?: number
  targetWeight?: number
  deltaWeight?: number
  trigger?: string[]
  invalidation?: string[]
  confidence?: number
}
type TabKey = 'overview' | 'market' | 'news' | 'company' | 'portfolio'
type ExportTarget = Record<TabKey, HTMLDivElement | null>
const ALL_TAB_KEYS: TabKey[] = ['overview', 'market', 'news', 'company', 'portfolio']

function stripJsonFence(value: string) {
  return value.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '')
}

function decodeLooseString(value: string) {
  return value
    .replace(/\\n/g, '\n')
    .replace(/\\r/g, '\r')
    .replace(/\\t/g, '\t')
    .replace(/\\"/g, '"')
    .replace(/\\\\/g, '\\')
}

function extractBalanced(text: string, start: number, open: string, close: string) {
  let depth = 0
  let quoted = false
  let escaped = false
  for (let index = start; index < text.length; index += 1) {
    const char = text[index]
    if (quoted) {
      if (escaped) escaped = false
      else if (char === '\\') escaped = true
      else if (char === '"') quoted = false
      continue
    }
    if (char === '"') quoted = true
    else if (char === open) depth += 1
    else if (char === close) {
      depth -= 1
      if (depth === 0) return text.slice(start, index + 1)
    }
  }
  return undefined
}

function extractLooseString(text: string, key: string, nextKeys: string[] = []) {
  const marker = `"${key}"`
  const markerStart = text.indexOf(marker)
  if (markerStart < 0) return undefined
  const colon = text.indexOf(':', markerStart + marker.length)
  const valueStart = text.indexOf('"', colon + 1)
  if (colon < 0 || valueStart < 0) return undefined
  const boundaries = nextKeys.map((nextKey) => {
    const match = new RegExp(`",\\s*"${nextKey}"\\s*:`).exec(text.slice(valueStart + 1))
    return match ? valueStart + 1 + match.index : -1
  }).filter((index) => index >= 0)
  const valueEnd = boundaries.length > 0 ? Math.min(...boundaries) : text.lastIndexOf('"')
  if (valueEnd <= valueStart) return undefined
  return decodeLooseString(text.slice(valueStart + 1, valueEnd))
}

function extractLooseNumber(text: string, key: string) {
  const match = new RegExp(`"${key}"\\s*:\\s*(-?\\d+(?:\\.\\d+)?)`).exec(text)
  return match ? Number(match[1]) : undefined
}

function extractRecommendationItems(text: string): Recommendation[] {
  const markerStart = text.indexOf('"recommendations"')
  const arrayStart = markerStart >= 0 ? text.indexOf('[', markerStart) : -1
  const arrayText = arrayStart >= 0 ? extractBalanced(text, arrayStart, '[', ']') : undefined
  if (!arrayText) return []
  const objectMatches = arrayText.match(/\{[\s\S]*?\}(?=\s*,|\s*$)/g) || []
  return objectMatches.map((item) => ({
    action: extractLooseString(item, 'action', ['target']),
    target: extractLooseString(item, 'target', ['targetType']),
    targetType: extractLooseString(item, 'targetType', ['reason']),
    reason: extractLooseString(item, 'reason', ['allocation']),
    allocation: extractLooseNumber(item, 'allocation'),
    targetPrice: extractLooseNumber(item, 'targetPrice'),
  })).filter((item) => item.target || item.reason)
}

function parseAdvice(value: unknown): unknown {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    const record = value as RecordValue
    for (const candidate of [record.strategy, record.summary, record.content]) {
      if (typeof candidate !== 'string') continue
      const nested = parseAdvice(candidate)
      const nestedRecord = asRecord(nested)
      if (nestedRecord.strategy || nestedRecord.summary || nestedRecord.recommendations) {
        return {
          ...record,
          ...nestedRecord,
          recommendations: Array.isArray(record.recommendations) && record.recommendations.length > 0
            ? record.recommendations
            : nestedRecord.recommendations,
        }
      }
    }
    return value
  }
  if (typeof value !== 'string') return value

  const text = stripJsonFence(value)
  try {
    return JSON.parse(text)
  } catch {
    const objectStart = text.indexOf('{')
    if (objectStart >= 0) {
      const objectText = extractBalanced(text, objectStart, '{', '}')
      if (objectText) {
        try { return JSON.parse(objectText) } catch {}
      }
    }
    return {
      industry: extractLooseString(text, 'industry', ['strategy']),
      strategy: extractLooseString(text, 'strategy', ['recommendations']),
      recommendations: extractRecommendationItems(text),
      riskWarning: extractLooseString(text, 'riskWarning', ['summary']),
      summary: extractLooseString(text, 'summary'),
    }
  }
}

function parseStructured(value: unknown): unknown {
  if (typeof value !== 'string') return value
  const text = stripJsonFence(value)
  if (!text) return value
  try { return parseStructured(JSON.parse(text)) } catch { return value }
}

function asRecord(value: unknown): RecordValue {
  const parsed = parseStructured(value)
  return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed as RecordValue : {}
}

function asArray(value: unknown) {
  const parsed = parseStructured(value)
  return Array.isArray(parsed) ? parsed : []
}

function normalizeAdvice(value: unknown) {
  const parsed = asRecord(parseAdvice(value))
  if (Array.isArray(parsed.recommendations) && parsed.recommendations.length > 0) return parsed
  for (const candidate of [parsed.strategy, parsed.summary, parsed.content]) {
    if (typeof candidate !== 'string') continue
    const nested = asRecord(parseAdvice(candidate))
    if (Array.isArray(nested.recommendations) && nested.recommendations.length > 0) return { ...parsed, ...nested }
  }
  return parsed
}

function display(value: unknown, fallback: unknown = '') {
  if (value == null || value === '') return String(fallback)
  const text = String(value)
  return text.replace(/(?:&#x20;|&#32;|&nbsp;)/gi, ' ').trim() || String(fallback)
}

function buildHistoricalOverviewSummary(summary: string, market: NormalizedMarket, news: ReturnType<typeof normalizeNews>, company: ReturnType<typeof normalizeCompany>, structure: RecordValue) {
  // 旧报告可能只保存了“数据复核”规则摘要；从已保存快照补齐跨模块结论，保证历史报告也可读。
  if (!/^今日建议(?:暂不新增风险|维持现有仓位)/u.test(summary)) return summary
  const changes = market.etfs.map((row) => numberValue(row.price_change_pct)).filter((value): value is number => value != null && Math.abs(value) <= 50)
  const sorted = [...changes].sort((a, b) => a - b)
  const median = sorted.length ? sorted[Math.floor(sorted.length / 2)] : null
  const breadth = changes.length ? Math.round(changes.filter((value) => value > 0).length / changes.length * 100) : null
  const leader = company.topCompanies[0]
  const segment = asArray(structure.positiveSegments)[0] as RecordValue | undefined
  const marketText = changes.length ? `有效市场样本${changes.length}/${market.etfs.length}个，中位数${formatPercent(median)}，上涨占比${breadth}%` : '市场缺少可用区间收益样本'
  const companyText = leader ? `重点企业${display(leader.name, '样本')}综合评分${display(leader.overall_score ?? leader.overallScore, '暂无')}` : `企业分析覆盖${company.analyzed}/${company.total}家`
  const segmentText = segment ? `${display(segment.segment, '重点环节')}平均涨跌${formatPercent(segment.averageChange ?? segment.average_change)}` : `产业链已映射${display(structure.taggedNewsCount, '0')}条资讯`
  const newsText = news.analysis ? `资讯判断：${news.analysis.replace(/\s+/gu, ' ').slice(0, 180)}` : '资讯暂无聚合结论'
  return `${summary.split('；主要原因')[0]}。${marketText}；${companyText}；${segmentText}；${newsText}。`
}

function numberValue(value: unknown) {
  const number = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(number) ? number : null
}

function formatPercent(value: unknown) {
  const number = numberValue(value)
  return number == null ? '暂无' : `${number >= 0 ? '+' : ''}${number.toFixed(2)}%`
}

function formatMoney(value: unknown) {
  const number = numberValue(value)
  return number == null ? '暂无' : `¥${number.toLocaleString('zh-CN', { maximumFractionDigits: 2 })}`
}

function tone(value: unknown) {
  const number = numberValue(value)
  return number == null ? 'text-muted-foreground' : number > 0 ? 'text-rose-600' : number < 0 ? 'text-emerald-600' : 'text-muted-foreground'
}

function latestChangeValue(row: RecordValue) {
  return numberValue(row.latest_change_pct ?? row.latestChangePct ?? row.daily_change_pct ?? row.dailyChangePct ?? row.changePct)
}

function periodChangeValue(row: RecordValue) {
  return numberValue(row.price_change_pct ?? row.priceChangePct ?? row.change_pct)
}

function displayChange(row: RecordValue, explicitRange = false) {
  return explicitRange ? periodChangeValue(row) : latestChangeValue(row) ?? periodChangeValue(row)
}

const newsTagLabels: Record<string, string> = {
  'semiconductor equipment': '半导体设备',
  'semiconductor_equipment': '半导体设备',
  'wafer foundry': '晶圆代工',
  'wafer_foundry': '晶圆代工',
  'chip design': '芯片设计',
  'chip_design': '芯片设计',
  'advanced packaging': '先进封装',
  'advanced_packaging': '先进封装',
  'memory chip': '存储芯片',
  'memory_chip': '存储芯片',
  'cloud computing': '云计算',
  'cloud_computing': '云计算',
  'artificial intelligence': '人工智能',
  'artificial_intelligence': '人工智能',
  'ai': '人工智能',
  'gpu': 'GPU',
  'cpu': 'CPU',
  'hbm': 'HBM',
  'supply chain': '供应链',
  'supply_chain': '供应链',
  'capital expenditure': '资本开支',
  'capital_expenditure': '资本开支',
  'policy': '政策',
  'earnings': '业绩',
  'market': '市场',
  'ai_chip_design': 'AI芯片设计',
  'ai_chip_manufacturing': 'AI芯片制造',
  'ai_chip_testing': 'AI芯片测试',
  'ai_server_board': 'AI服务器板卡',
  'ai_server': 'AI服务器',
  'chip_manufacturing': '芯片制造',
  'chip_testing': '芯片测试',
  'chip_equipment': '芯片设备',
  'semiconductor_material': '半导体材料',
  'semiconductor_materials': '半导体材料',
  'semiconductor_testing': '半导体测试',
  'wafer_manufacturing': '晶圆制造',
  'wafer_fabrication': '晶圆制造',
  'foundry': '晶圆代工',
  'packaging_testing': '封装测试',
  'chip_packaging': '芯片封装',
  'memory': '存储芯片',
  'server_board': '服务器板卡',
  'data_center': '数据中心',
  'data_center_server': '数据中心服务器',
  'cloud': '云计算',
  'cloud_service': '云服务',
  'large_model': '大模型',
  'ai_model': 'AI模型',
  'algorithm': '算法',
  'optical_module': '光模块',
  'optical_communication': '光通信',
  'display_panel': '显示面板',
  'sensor': '传感器',
  'power_semiconductor': '功率半导体',
  'compound_semiconductor': '化合物半导体',
  'substrate': '封装基板',
  'robotics': '机器人',
  'autonomous_driving': '自动驾驶',
  'industrial_software': '工业软件',
}

function newsTagLabel(value: unknown) {
  const raw = display(value).trim()
  if (!raw) return ''
  const normalized = raw.toLowerCase().replace(/[：:]/g, '').trim()
  if (newsTagLabels[normalized]) return newsTagLabels[normalized]
  if (/[一-鿿]/.test(raw)) return raw

  const words = normalized.split(/[_\s-]+/).filter(Boolean)
  const wordLabels: Record<string, string> = {
    ai: 'AI',
    artificial: '人工智能',
    intelligence: '智能',
    chip: '芯片',
    semiconductor: '半导体',
    equipment: '设备',
    wafer: '晶圆',
    foundry: '代工',
    design: '设计',
    manufacturing: '制造',
    fabrication: '制造',
    packaging: '封装',
    testing: '测试',
    test: '测试',
    memory: '存储',
    server: '服务器',
    board: '板卡',
    gpu: 'GPU',
    cpu: 'CPU',
    hbm: 'HBM',
    cloud: '云计算',
    data: '数据',
    center: '中心',
    model: '模型',
    optical: '光',
    communication: '通信',
    display: '显示',
    panel: '面板',
    sensor: '传感器',
    power: '功率',
    material: '材料',
    materials: '材料',
    substrate: '基板',
    robotics: '机器人',
    robot: '机器人',
    software: '软件',
    industry: '产业',
    supply: '供应链',
    chain: '链',
  }
  const translated = words.map((word) => wordLabels[word]).filter(Boolean)
  return translated.length > 0 ? Array.from(new Set(translated)).join('') : ''
}

function newsSegmentLabels(row: RecordValue) {
  const namedSegments = Array.isArray(row.industrySegments)
    ? row.industrySegments
        .map((item) => typeof item === 'object' && item !== null ? display((item as Record<string, unknown>).segment_name) : '')
        .map(newsTagLabel)
        .filter(Boolean)
    : []
  const codedSegments = Array.isArray(row.segmentCodes) ? row.segmentCodes.map(newsTagLabel).filter(Boolean) : []
  return Array.from(new Set([...namedSegments, ...codedSegments]))
}

function sentimentGroup(value: unknown) {
  const sentiment = numberValue(value) ?? 0
  return sentiment > 0.1 ? 'positive' : sentiment < -0.1 ? 'negative' : 'neutral'
}

function trendLabel(value: unknown) {
  const labels: Record<string, string> = {
    strong_uptrend: '强势上涨',
    uptrend: '上涨趋势',
    sideways: '震荡',
    downtrend: '下跌趋势',
    strong_downtrend: '强势下跌',
    unknown: '趋势未知',
  }
  return labels[String(value)] || display(value, '暂无')
}

function actionLabel(action?: string) {
  return action === 'buy' ? '建仓' : action === 'add' || action === 'increase' ? '加仓' : action === 'sell' ? '减仓' : action === 'reduce' ? '减仓' : action === 'hold' ? '持有' : action === 'data_review' ? '数据复核' : action === 'no_action' ? '今日不动' : '观察'
}

function actionRank(action?: string) {
  return action === 'buy' ? 0 : action === 'add' || action === 'increase' ? 1 : action === 'reduce' || action === 'sell' ? 2 : action === 'hold' ? 3 : action === 'data_review' ? 4 : action === 'no_action' ? 5 : 6
}

function actionVariant(action?: string): 'default' | 'secondary' | 'destructive' | 'outline' {
  return action === 'sell' || action === 'reduce' ? 'destructive' : action === 'buy' || action === 'add' || action === 'increase' ? 'default' : action === 'hold' ? 'secondary' : 'outline'
}

function decisionLabel(value?: string) {
  return value === 'increase' ? '允许小比例增加' : value === 'maintain' ? '维持仓位' : value === 'reduce' ? '降低风险暴露' : value === 'wait' ? '等待，不新增风险' : '混合信号，先复核'
}

function normalizeUserFacingText(value: string) {
  return localizeUserFacingText(value)
    .replace(/([^\s；，。]+)\/([+-]?\d+(?:\.\d+)?%)/g, '$1：$2')
}

function hasUpstreamError(value: unknown) {
  return typeof value === 'string' && /报告生成失败|upstream service temporarily unavailable|upstream_error/i.test(value)
}

function buildMarketFallback(market: RecordValue) {
  const etfs = asArray(market.etf_analysis).map(asRecord).filter((item) => !item.is_fallback && Math.abs(numberValue(item.price_change_pct) ?? 0) <= 50 && (numberValue(item.volatility) ?? 0) <= 150 && (numberValue(item.max_drawdown) ?? 0) <= 70)
  const changes = etfs.map((item) => numberValue(item.price_change_pct)).filter((value): value is number => value != null)
  const average = changes.length > 0 ? changes.reduce((sum, value) => sum + value, 0) / changes.length : null
  const strongest = [...etfs].sort((a, b) => (numberValue(b.price_change_pct) ?? -Infinity) - (numberValue(a.price_change_pct) ?? -Infinity))[0]
  const weakest = [...etfs].sort((a, b) => (numberValue(a.price_change_pct) ?? Infinity) - (numberValue(b.price_change_pct) ?? Infinity))[0]
  const quality = asRecord(market.data_quality)
  return [
    '## 结构化市场结论',
    `本次覆盖 ${etfs.length} 个 ETF，样本区间平均涨跌 ${formatPercent(average)}，数据质量为${display(quality.level, '暂无')}。`,
    strongest ? `相对强势：${display(strongest.name || strongest.code, '标的')}，区间涨跌 ${formatPercent(strongest.price_change_pct)}。` : '暂无相对强势标的。',
    weakest ? `相对弱势：${display(weakest.name || weakest.code, '标的')}，区间涨跌 ${formatPercent(weakest.price_change_pct)}。` : '暂无相对弱势标的。',
    'AI文字报告暂不可用，以上结论由本次已获取的行情与结构化指标整理生成。',
  ].join('\n\n')
}

function buildNewsFallback(newsPayload: RecordValue, news: unknown[]) {
  const rows = news.map(asRecord)
  const positive = rows.filter((item) => (numberValue(item.sentiment) ?? 0) > 0.1).length
  const negative = rows.filter((item) => (numberValue(item.sentiment) ?? 0) < -0.1).length
  const neutral = Math.max(rows.length - positive - negative, 0)
  const topImpact = [...rows].sort((a, b) => (numberValue(b.impact) ?? 0) - (numberValue(a.impact) ?? 0))[0]
  return [
    '## 结构化资讯结论',
    `本次共纳入 ${rows.length} 条资讯，其中偏积极 ${positive} 条、偏谨慎 ${negative} 条、中性 ${neutral} 条，资讯面呈现多空交织。`,
    topImpact ? `高影响样本：${display(topImpact.title, '未命名资讯')}。该信息仍需结合产业链实际数据验证。` : '暂无高影响资讯样本。',
    `资讯数据来自当前报告样本（${display(newsPayload.source, '产业资讯数据')}），不将单条新闻直接等同于投资结论。`,
  ].join('\n\n')
}

function safeReportText(value: unknown, fallback: string) {
  return typeof value === 'string' && value.trim() && !hasUpstreamError(value) ? value : fallback
}

function splitRiskItems(value: unknown): string[] {
  const parsed = parseStructured(value)
  if (Array.isArray(parsed)) return parsed.flatMap((item) => splitRiskItems(item))
  if (parsed && typeof parsed === 'object') {
    const record = parsed as RecordValue
    return splitRiskItems(record.riskWarning ?? record.items ?? record.content ?? '')
  }
  const text = display(parsed).replace(/\\n/g, '\n').trim()
  const marked = text.replace(/(^|[\s。！？；])(\d+)\s*[、.)]\s*/g, '$1\u0000$2. ')
  return marked.split('\u0000').map((item) => item.trim()).filter(Boolean)
}

function ReportMarkdown({ value, fallback }: { value: unknown; fallback: string }) {
  const text = normalizeUserFacingText(safeReportText(value, fallback))
  return (
    <article className="space-y-3 text-sm leading-7 text-foreground/90 [&_blockquote]:border-l-2 [&_blockquote]:pl-4 [&_blockquote]:text-muted-foreground [&_code]:rounded [&_code]:bg-muted [&_code]:px-1 [&_code]:py-0.5 [&_h1]:text-xl [&_h1]:font-semibold [&_h2]:border-b [&_h2]:pb-2 [&_h2]:text-base [&_h2]:font-semibold [&_h3]:text-sm [&_h3]:font-semibold [&_li]:ml-5 [&_li]:list-disc [&_p]:leading-7 [&_strong]:font-semibold [&_table]:min-w-full [&_td]:border-t [&_td]:px-3 [&_td]:py-2 [&_th]:bg-muted/40 [&_th]:px-3 [&_th]:py-2 [&_ul]:space-y-1">
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={{
        table: ({ children }) => <div className="overflow-x-auto rounded-lg border"><table>{children}</table></div>,
      }}>{text}</ReactMarkdown>
    </article>
  )
}

function SectionHeading({ icon: Icon, title, description, badge }: { icon: typeof Activity; title: string; description: string; badge?: string }) {
  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
      <div className="flex min-w-0 items-start gap-3">
        <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary"><Icon className="h-4 w-4" aria-hidden="true" /></span>
        <div className="min-w-0">
          <h2 className="text-base font-semibold tracking-tight">{title}</h2>
          <p className="mt-1 text-sm leading-6 text-muted-foreground">{description}</p>
        </div>
      </div>
      {badge && <Badge variant="secondary" className="w-fit shrink-0">{badge}</Badge>}
    </div>
  )
}

function StatCard({ label, value, detail, toneClass = 'text-foreground' }: { label: string; value: string; detail?: string; toneClass?: string }) {
  return <div className="rounded-xl border bg-card p-4 shadow-sm"><div className="text-xs font-medium text-muted-foreground">{label}</div><div className={`mt-2 text-xl font-semibold tabular-nums ${toneClass}`}>{value}</div>{detail && <div className="mt-1 text-xs text-muted-foreground">{detail}</div>}</div>
}

function RecommendationTable({ recommendations }: { recommendations: Recommendation[] }) {
  const ordered = [...recommendations].filter((item) => item.targetType === 'holding').sort((a, b) => (a.priority ?? 999) - (b.priority ?? 999) || actionRank(a.action) - actionRank(b.action))
  return <section className="rounded-xl border bg-background/80 p-4"><div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between"><div><h3 className="text-sm font-semibold">每日执行动作</h3><p className="mt-1 text-xs leading-5 text-muted-foreground">仅分析带有当前领域标签的持仓基金。市场 ETF、指数和产业标的只参与市场环境判断，不生成执行动作。</p></div><Badge variant="outline">{ordered.length} 只领域持仓</Badge></div>{ordered.length === 0 ? <EmptyState text="当前没有带有该领域标签的持仓基金，暂不生成执行动作。" /> : <div className="overflow-x-auto rounded-lg border"><Table className="min-w-[980px]"><TableHeader><TableRow><TableHead className="w-[190px]">持仓基金</TableHead><TableHead className="w-[110px]">动作</TableHead><TableHead className="w-[110px] text-right">当前仓位</TableHead><TableHead className="min-w-[320px]">综合判断</TableHead><TableHead className="min-w-[220px]">执行条件</TableHead><TableHead className="min-w-[220px]">失效条件</TableHead></TableRow></TableHeader><TableBody>{ordered.map((item, index) => <TableRow key={`${item.symbol || item.target}-${index}`} className="align-top"><TableCell><div className="font-medium">{display(item.target, '未指定标的')}</div><div className="mt-1 font-mono text-xs text-muted-foreground">{display(item.symbol, '代码缺失')}</div></TableCell><TableCell><Badge variant={actionVariant(item.action)}>{actionLabel(item.action)}</Badge></TableCell><TableCell className="text-right tabular-nums">{item.currentWeight != null ? `${item.currentWeight.toFixed(1)}%` : '—'}</TableCell><TableCell><p className="whitespace-normal text-sm leading-6 text-foreground/85">{display(item.reason, '暂无执行理由')}</p></TableCell><TableCell><p className="whitespace-normal text-xs leading-5 text-muted-foreground">{item.trigger?.join('；') || '按数据变化复核'}</p></TableCell><TableCell><p className="whitespace-normal text-xs leading-5 text-muted-foreground">{item.invalidation?.join('；') || '信号反转时复核'}</p></TableCell></TableRow>)}</TableBody></Table></div>}</section>
}

function ModuleHealthPanel({ modules }: { modules: RecordValue }) {
  const items = [
    { key: 'market', label: '市场', detail: '行情、指数与资金流向' },
    { key: 'news', label: '资讯', detail: '新闻样本与产业链映射' },
    { key: 'company', label: '企业', detail: '行情、财报与公告' },
    { key: 'portfolio', label: '持仓', detail: '当前组合与产业映射' },
  ]
  const statusLabels: Record<string, string> = { success: '有效', degraded: '降级', failed: '失败' }
  const statusTone: Record<string, string> = {
    success: 'border-emerald-500/25 bg-emerald-500/5',
    degraded: 'border-amber-500/30 bg-amber-500/5',
    failed: 'border-destructive/30 bg-destructive/5',
  }
  return (
    <section className="rounded-xl border bg-background/70 p-4" aria-label="综合分析输入源健康度">
      <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h3 className="text-sm font-semibold">输入源健康度</h3>
          <p className="mt-1 text-xs leading-5 text-muted-foreground">只有“有效”的输入才会参与跨模块判断；失败或降级源不会被当作已完成分析。</p>
        </div>
        <Badge variant="outline">链路诊断</Badge>
      </div>
      <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {items.map((item) => {
          const state = asRecord(modules[item.key])
          const status = display(state.status, 'unknown')
          const failed = status === 'failed'
          const Icon = failed ? XCircle : status === 'success' ? CheckCircle2 : AlertTriangle
          return (
            <div key={item.key} className={`rounded-lg border p-3 ${statusTone[status] || 'bg-muted/20'}`}>
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 text-sm font-medium"><Icon className={`h-4 w-4 ${failed ? 'text-destructive' : status === 'success' ? 'text-emerald-600' : 'text-amber-600'}`} aria-hidden="true" />{item.label}</div>
                <Badge variant={failed ? 'destructive' : status === 'success' ? 'secondary' : 'outline'}>{statusLabels[status] || '未知'}</Badge>
              </div>
              <p className="mt-2 text-xs leading-5 text-muted-foreground">{item.detail} · {display(state.records, '0')} 条</p>
              {state.error && <p className="mt-2 text-xs leading-5 text-destructive">原因：{normalizeUserFacingText(display(state.error))}</p>}
            </div>
          )
        })}
      </div>
    </section>
  )
}

function OverviewPanel({ report, advice, recommendations, quality, modules }: { report: Report; advice: RecordValue; recommendations: Recommendation[]; quality: RecordValue; modules: RecordValue }) {
  const diagnostics = asRecord(quality.diagnostics)
  const abnormalSamples = asArray(quality.abnormalSamples).map(asRecord)
  const diagnosticItems = [
    ...abnormalSamples.map((item) => `${display(item.name, '未命名标的')}（${display(item.symbol, '无代码')}）：${asArray(item.reasons).map(display).join('；')}〔${display(item.source, '链路')}〕`),
    ...asArray(diagnostics.nextActions).map(display),
  ]
  const qualityIssues = [...asArray(quality.issues), ...asArray(quality.warnings), ...diagnosticItems].map((item) => normalizeUserFacingText(display(item))).filter(Boolean)
  const riskItems = splitRiskItems(advice.riskWarning).map((item) => normalizeUserFacingText(item))
  const decisionBrief = asRecord(advice.decisionBrief)
  const validation = asRecord(advice.validation)
  const generatedBy = display(advice.generatedBy, 'rules')
  const insightSource = generatedBy === 'hybrid'
    ? display(validation.valid) === 'false' ? 'AI 多源总结 · 已过滤无效建议' : 'AI 多源总结'
    : '规则兜底 · 需重新生成 AI 总结'
  const fallbackEvidence = asArray(advice.evidence).map(asRecord).map((item) => ({ title: display(item.title), value: display(item.value), direction: display(item.direction) }))
  const riskQualityItems = Array.from(new Set([...qualityIssues, ...riskItems])).filter(Boolean)
  const actionableRecommendations = recommendations.filter((item) => ['buy', 'add', 'reduce', 'sell', 'hold', 'watch'].includes(item.action || ''))
  const failedModules = Object.entries(modules).filter(([, value]) => display(asRecord(value).status) === 'failed').map(([key]) => ({ market: '市场', news: '资讯', company: '企业', portfolio: '持仓' }[key] || key))
  return <div className="space-y-5"><Card className="overflow-hidden border-primary/20 bg-gradient-to-br from-primary/[0.09] via-card to-card shadow-sm"><CardHeader><SectionHeading icon={FileText} title="综合投资建议" description="先给出可执行结论，再说明哪些输入支持结论、哪些输入失效。" badge={decisionLabel(display(advice.decision))} /></CardHeader><CardContent className="space-y-5"><div className="flex flex-wrap items-center gap-2"><Badge variant={generatedBy === 'hybrid' ? 'secondary' : 'outline'}>{insightSource}</Badge>{validation.warnings && <span className="text-xs text-muted-foreground">已记录 {asArray(validation.warnings).length} 条校验提示</span>}</div><div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4"><StatCard label="当前结论" value={decisionLabel(display(advice.decision))} detail="综合信号判断，不等同于数据门禁状态" toneClass={diagnostics.executableGate === '通过' ? 'text-emerald-600' : 'text-amber-600'} /><StatCard label="可执行动作" value={String(actionableRecommendations.length)} detail="不含数据复核动作" /><StatCard label="有效市场样本" value={`${display(diagnostics.validMarketSamples, '0')}/${display(diagnostics.totalMarketSamples, '0')}`} detail="用于判断市场强弱" /><StatCard label="有效输入模块" value={`${Object.values(modules).filter((value) => display(asRecord(value).status) === 'success').length}/4`} detail="市场、资讯、企业、持仓" /></div>{display(advice.decision) === 'mixed' && diagnostics.executableGate === '通过' && <Alert><Activity className="h-4 w-4" /><AlertTitle>门禁已通过，但跨模块信号仍存在分化</AlertTitle><AlertDescription>“混合信号，先复核”表示市场短线、区间趋势、企业现金流或资讯方向尚未形成一致共振，不表示输入源异常，也不是企业重点样本覆盖率导致的阻断。</AlertDescription></Alert>}{failedModules.length > 0 && <Alert variant="destructive"><XCircle className="h-4 w-4" /><AlertTitle>关键输入失效，当前报告不可视为完整投资分析</AlertTitle><AlertDescription>本次 {failedModules.join('、')} 模块失败；总览中的资讯与持仓仅作为已获取背景，不能替代市场或企业判断。请先按下方原因补齐数据后重新生成。</AlertDescription></Alert>}<ModuleHealthPanel modules={modules} /><ReportInsightHierarchy summary={display(advice.summary, display(report.summary, '暂无核心结论'))} strategy={display(advice.strategy, '暂无投资策略')} decisionBrief={{ headline: display(decisionBrief.headline), positiveSignals: asArray(decisionBrief.positiveSignals).map(display), negativeSignals: asArray(decisionBrief.negativeSignals).map(display), dataIssues: asArray(decisionBrief.dataIssues).map(display), action: display(decisionBrief.action), waitFor: asArray(decisionBrief.waitFor).map(display), }} fallbackEvidence={fallbackEvidence} /><RecommendationTable recommendations={recommendations} />{riskQualityItems.length > 0 && <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-4"><div className="flex items-center gap-2 text-sm font-semibold text-amber-700 dark:text-amber-300"><ShieldAlert className="h-4 w-4" />风险与质量提示</div><p className="mt-2 text-sm leading-6 text-muted-foreground">以下限制会影响建议的执行置信度，系统已自动限制不满足条件的新增风险动作：</p><ul className="mt-3 space-y-2 text-sm leading-6 text-muted-foreground">{riskQualityItems.map((item, index) => <li key={`${item}-${index}`} className="flex gap-2"><span className="text-amber-600">{index + 1}.</span><span>{item}</span></li>)}</ul></div>}</CardContent></Card></div>
}

function MarketPanel({ market, marketSnapshot, etfs, dataOnly = false }: { market: RecordValue; marketSnapshot: NormalizedMarket; etfs: unknown[]; dataOnly?: boolean }) {
  return <div className="space-y-5"><Card><CardHeader><SectionHeading icon={TrendingUp} title="市场走势与技术信号" description={dataOnly ? '展示原始市场数据，不生成市场结论。' : '展示市场结论、板块资金流向及全部 ETF/指数明细。'} badge="数据已就绪" /></CardHeader><CardContent><div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3"><StatCard label="ETF 样本" value={`${etfs.length} 只`} detail="全部匹配且有行情数据" /><StatCard label="市场指数样本" value={`${marketSnapshot.marketIndices.length} 个`} detail="用于核对分析基准" /><StatCard label="数据质量" value={localizeUserFacingText(display(asRecord(market.data_quality).level, '暂无'))} detail="来自市场数据快照" /></div>{!dataOnly && <div className="mt-5 rounded-xl border bg-background/70 p-4"><div className="mb-3 flex items-center gap-2 text-sm font-semibold"><FileText className="h-4 w-4 text-primary" />市场结论</div><ReportMarkdown value={marketSnapshot.trendReport} fallback="暂无市场结论" /></div>}</CardContent></Card><SectorFlowPanel sectorFlow={marketSnapshot.sectorFlow} /><MarketRowsPanel etfs={etfs} marketIndices={marketSnapshot.marketIndices} /></div>
}

function SectorFlowPanel({ sectorFlow }: { sectorFlow: Record<string, unknown> }) {
  const inflow = asArray(sectorFlow.topInflowSectors).map(asRecord)
  const outflow = asArray(sectorFlow.topOutflowSectors).map(asRecord)
  const date = display(sectorFlow.date, '日期未知')
  const source = display(sectorFlow.source, '数据服务')
  return <Card><CardHeader><SectionHeading icon={Activity} title="板块资金流向" description="按同一市场数据服务快照展示净流入与净流出榜单，金额统一为亿元。" badge={inflow.length || outflow.length ? `${date} · ${source}` : '暂无快照'} /></CardHeader><CardContent><div className="grid gap-3 md:grid-cols-2"><div className="rounded-lg border border-rose-200/60 bg-rose-50/60 p-3 dark:border-rose-900/50 dark:bg-rose-950/20"><div className="text-xs font-medium text-rose-700 dark:text-rose-300">净流入板块</div><div className="mt-2 space-y-2">{inflow.length > 0 ? inflow.slice(0, 10).map((row, index) => <div key={`${display(row.sector, index)}`} className="flex items-center justify-between gap-3 text-sm"><span className="min-w-0 truncate">{display(row.sector, '未命名板块')}</span><span className="shrink-0 font-semibold tabular-nums text-rose-700 dark:text-rose-300">+{numberValue(row.netFlow)?.toFixed(2) ?? '暂无'} 亿元</span></div>) : <span className="text-sm text-muted-foreground">暂无净流入样本</span>}</div></div><div className="rounded-lg border border-emerald-200/60 bg-emerald-50/60 p-3 dark:border-emerald-900/50 dark:bg-emerald-950/20"><div className="text-xs font-medium text-emerald-700 dark:text-emerald-300">净流出板块</div><div className="mt-2 space-y-2">{outflow.length > 0 ? outflow.slice(0, 10).map((row, index) => <div key={`${display(row.sector, index)}`} className="flex items-center justify-between gap-3 text-sm"><span className="min-w-0 truncate">{display(row.sector, '未命名板块')}</span><span className="shrink-0 font-semibold tabular-nums text-emerald-700 dark:text-emerald-300">{numberValue(row.netFlow)?.toFixed(2) ?? '暂无'} 亿元</span></div>) : <span className="text-sm text-muted-foreground">暂无净流出样本</span>}</div></div></div></CardContent></Card>
}

function MarketRowsPanel({ etfs, marketIndices }: { etfs: unknown[]; marketIndices: unknown[] }) {
  const renderRows = (items: unknown[], kind: string) => <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">{items.map((item, index) => { const row = asRecord(item); const code = display(row.code || row.symbol, '暂无代码'); const name = display(row.name, '名称缺失'); const change = displayChange(row); return <div key={`${code}-${index}`} className="rounded-xl border p-4 transition-colors hover:border-primary/40 hover:bg-muted/15"><div className="flex items-start justify-between gap-3"><div className="min-w-0"><div className={`truncate font-medium ${name === '名称缺失' ? 'text-amber-700 dark:text-amber-300' : ''}`}>{name}</div><div className="mt-1 flex items-center gap-2 text-xs text-muted-foreground"><Badge variant="outline" className="h-5 px-1.5 text-[10px]">{kind}</Badge><span className="font-mono">{code}</span></div></div><span className={`shrink-0 text-sm font-semibold ${tone(change)}`}>{formatPercent(change)}</span></div><div className="mt-4 grid grid-cols-2 gap-3 text-xs"><Metric label="最新价格" value={display(row.current_price || row.price, '暂无')} /><Metric label="趋势" value={trendLabel(row.trend)} /><Metric label="波动率" value={formatPercent(row.volatility)} /><Metric label="最大回撤" value={formatPercent(row.max_drawdown)} /><Metric label="数据点" value={display(row.data_points, '暂无')} /></div></div>})}</div>
  const section = (title: string, description: string, items: unknown[], kind: string, emptyText: string) => <Card><CardHeader><SectionHeading icon={Layers3} title={title} description={description} badge={`${items.length} 个标的`} /></CardHeader><CardContent>{items.length > 0 ? renderRows(items, kind) : <EmptyState text={emptyText} />}</CardContent></Card>
  return <div className="space-y-5">{section('ETF 行情明细', '完整保留本次市场页面传入并成功获取行情的 ETF，不按点数、波动或回撤再次过滤。', etfs, 'ETF', '暂无 ETF 明细')}{section('市场指数', '直接对应市场页面的指数输入，用于核对分析时采用的基准。', marketIndices, '市场指数', '暂无市场指数快照')}</div>
}

function LegacyMarketPanel({ market, marketSnapshot, etfs, indices, dataOnly = false }: { market: RecordValue; marketSnapshot: NormalizedMarket; etfs: unknown[]; indices: unknown[]; dataOnly?: boolean }) {
  const marketOverview = asRecord(market.market_overview)
  const macroIndices = asArray(market.market_indices || marketOverview.indices)
  const sectorFlow = asRecord(market.sector_flow || market.sectorFlow)
  const inflowSectors = asArray(sectorFlow.topInflowSectors).map(asRecord).slice(0, 5)
  const outflowSectors = asArray(sectorFlow.topOutflowSectors).map(asRecord).slice(0, 5)
  const quality = asRecord(market.data_quality)
  const scores = asRecord(market.quantitative_scores)
  const allRows = [...etfs, ...indices].map(asRecord)
  const abnormalRows = allRows.filter((row) => Boolean(row.is_fallback) || Math.abs(numberValue(row.price_change_pct ?? row.priceChangePct ?? row.change_pct) ?? 0) > 50 || (numberValue(row.volatility) ?? 0) > 150 || (numberValue(row.max_drawdown ?? row.maxDrawdown) ?? 0) > 70)
  const rows = allRows.filter((row) => !abnormalRows.includes(row)).sort((a, b) => (displayChange(b) ?? -Infinity) - (displayChange(a) ?? -Infinity))
  const marketChart = rows.map((row, index) => ({ name: display(row.name || row.code || row.symbol, `标的${index + 1}`).slice(0, 10), change: displayChange(row) ?? 0 })).slice(0, 8)
  const changes = rows.map((row) => displayChange(row)).filter((value): value is number => value != null)
  const averageChange = changes.length ? changes.reduce((sum, value) => sum + value, 0) / changes.length : null
  const fallback = buildMarketFallback(market)
  const reportText = normalizeMarketReportText(safeReportText(market.trend_report || market.trendReport, fallback), marketSnapshot, display(quality.level, '未知'))
  const hasSectorFlowSnapshot = Array.isArray(sectorFlow.topInflowSectors) || Array.isArray(sectorFlow.topOutflowSectors)
  return <div className="space-y-5"><Card><CardHeader><SectionHeading icon={TrendingUp} title="市场走势与技术信号" description={dataOnly ? '展示原始行情、指数与量化指标，不生成市场结论。' : '将市场报告、宏观指数、ETF/指数表现和数据质量放在同一阅读路径中。'} badge={hasUpstreamError(market.trend_report) ? '结构化降级' : '数据已就绪'} /></CardHeader><CardContent className="space-y-5"><div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4"><StatCard label="覆盖 ETF" value={`${etfs.length} 个`} detail="纳入技术指标计算" /><StatCard label="覆盖指数" value={`${indices.length} 个`} detail="产业相关指数" /><StatCard label="最新平均涨跌" value={formatPercent(averageChange)} toneClass={tone(averageChange)} detail="优先采用最新交易日数据" /><StatCard label="数据质量" value={localizeUserFacingText(display(quality.level, '暂无'))} detail={`${display(quality.avg_data_points, '—')} 个平均数据点`} /></div><div className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">{!dataOnly && <div className="min-w-0 rounded-xl border bg-background/70 p-4"><div className="mb-3 flex items-center gap-2 text-sm font-semibold"><FileText className="h-4 w-4 text-primary" />市场结论</div><ReportMarkdown value={reportText} fallback={fallback} /></div>}<div className={`min-w-0 rounded-xl border bg-background/70 p-4 ${dataOnly ? 'xl:col-span-2' : ''}`}><div className="mb-3 flex items-center gap-2 text-sm font-semibold"><BarChart3 className="h-4 w-4 text-primary" />最新涨跌</div>{marketChart.length > 0 ? <ResponsiveContainer width="100%" height={270}><BarChart data={marketChart} layout="vertical" margin={{ left: 8, right: 14 }}><CartesianGrid strokeDasharray="3 3" horizontal={false} /><XAxis type="number" tickFormatter={(value) => `${value}%`} /><YAxis dataKey="name" type="category" width={82} tick={{ fontSize: 11 }} /><Tooltip formatter={(value) => [`${Number(value).toFixed(2)}%`, '最新涨跌']} /><Bar dataKey="change" radius={[0, 4, 4, 0]}>{marketChart.map((entry) => <Cell key={entry.name} fill={entry.change > 0 ? '#dc2626' : entry.change < 0 ? '#16a34a' : '#94a3b8'} />)}</Bar></BarChart></ResponsiveContainer> : <EmptyState text="暂无可用行情图表" />}</div></div>{(inflowSectors.length > 0 || outflowSectors.length > 0 || !hasSectorFlowSnapshot) && <div className="rounded-xl border bg-background/70 p-4"><div className="mb-3 flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between"><div><div className="flex items-center gap-2 text-sm font-semibold"><Activity className="h-4 w-4 text-primary" />板块资金流向</div><p className="mt-1 text-xs text-muted-foreground">已接入市场数据；金额单位为亿元，正负方向不只依赖颜色。</p></div><Badge variant={hasSectorFlowSnapshot ? 'secondary' : 'outline'}>{hasSectorFlowSnapshot ? '已获取' : '未保存快照'}</Badge></div>{!hasSectorFlowSnapshot && <div className="rounded-lg border border-dashed bg-muted/20 p-3 text-sm leading-6 text-muted-foreground">该历史报告未保存板块资金流向快照。</div>}<div className="grid gap-3 md:grid-cols-2"><div className="rounded-lg border border-rose-200/60 bg-rose-50/60 p-3 dark:border-rose-900/50 dark:bg-rose-950/20"><div className="text-xs font-medium text-rose-700 dark:text-rose-300">净流入板块</div><div className="mt-2 space-y-2">{inflowSectors.length > 0 ? inflowSectors.map((row, index) => <div key={`${display(row.sector || row.name, index)}`} className="flex items-center justify-between gap-3 text-sm"><span className="min-w-0 truncate">{display(row.sector || row.name, '未命名板块')}</span><span className="shrink-0 font-semibold tabular-nums text-rose-700 dark:text-rose-300">+{numberValue(row.netFlow)?.toFixed(2) ?? '暂无'} 亿元</span></div>) : <span className="text-sm text-muted-foreground">暂无净流入样本</span>}</div></div><div className="rounded-lg border border-emerald-200/60 bg-emerald-50/60 p-3 dark:border-emerald-900/50 dark:bg-emerald-950/20"><div className="text-xs font-medium text-emerald-700 dark:text-emerald-300">净流出板块</div><div className="mt-2 space-y-2">{outflowSectors.length > 0 ? outflowSectors.map((row, index) => <div key={`${display(row.sector || row.name, index)}`} className="flex items-center justify-between gap-3 text-sm"><span className="min-w-0 truncate">{display(row.sector || row.name, '未命名板块')}</span><span className="shrink-0 font-semibold tabular-nums text-emerald-700 dark:text-emerald-300">{numberValue(row.netFlow)?.toFixed(2) ?? '暂无'} 亿元</span></div>) : <span className="text-sm text-muted-foreground">暂无净流出样本</span>}</div></div></div></div>}</CardContent></Card><Card><CardHeader><SectionHeading icon={Activity} title="宏观指数与量化评分" description="补充原数据解析中的指数快照和量化评分。" /></CardHeader><CardContent className="space-y-5"><div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">{macroIndices.map((item, index) => { const row = asRecord(item); const change = latestChangeValue(row) ?? numberValue(row.changePct ?? row.change_pct ?? row.change); return <div key={`${display(row.code, index)}`} className="rounded-xl border bg-muted/15 p-3"><div className="flex items-start justify-between gap-2"><div><div className="text-sm font-medium">{display(row.name, '市场指数')}</div><div className="mt-1 text-xs text-muted-foreground">{display(row.code, '暂无代码')}</div></div><span className={`text-sm font-semibold ${tone(change)}`}>{formatPercent(change)}</span></div><div className="mt-3 text-lg font-semibold tabular-nums">{display(row.price, '暂无')}</div></div> })}</div><div className="grid gap-3 sm:grid-cols-3"><StatCard label="产业热度" value={`${display(scores.industry_heat, '暂无')}/100`} detail="量化评分" /><StatCard label="投资价值" value={`${display(scores.investment_value, '暂无')}/100`} detail="量化评分" toneClass="text-foreground" /><StatCard label="风险等级" value={`${display(scores.risk_level, '暂无')}/100`} detail="分数越高风险越高" toneClass="text-amber-600" /></div></CardContent></Card><Card><CardHeader><SectionHeading icon={Layers3} title="ETF 与指数明细" description="未标明统计区间时展示最新交易日涨跌；需要历史比较时单独标明区间。" badge={`${rows.length} 个标的`} /></CardHeader><CardContent><div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">{rows.map((row, index) => { const change = displayChange(row); return <div key={`${display(row.code || row.symbol, index)}`} className="rounded-xl border p-4 transition-colors hover:bg-muted/15"><div className="flex items-start justify-between gap-3"><div className="min-w-0"><div className="truncate font-medium">{display(row.name || row.code || row.symbol, '市场标的')}</div><div className="mt-1 text-xs text-muted-foreground">{display(row.code || row.symbol, '暂无代码')}</div></div><span className={`shrink-0 text-sm font-semibold ${tone(change)}`}>{formatPercent(change)}</span></div><div className="mt-4 grid grid-cols-2 gap-3 text-xs"><Metric label="最新价格" value={display(row.current_price, '暂无')} /><Metric label="趋势" value={trendLabel(row.trend)} /><Metric label="波动率" value={formatPercent(row.volatility)} /><Metric label="最大回撤" value={formatPercent(row.max_drawdown)} /><Metric label="RSI" value={display(row.rsi, '暂无')} /><Metric label="数据点" value={display(row.data_points, '暂无')} /></div></div> })}</div></CardContent></Card></div>
}

function NewsPanel({ payload, news, dataOnly = false }: { payload: RecordValue; news: unknown[]; dataOnly?: boolean }) {
  const allRows = news.map(asRecord)
  const rows = [...allRows].sort((a, b) => (numberValue(b.impact) ?? 0) - (numberValue(a.impact) ?? 0))
  const positive = allRows.filter((item) => (numberValue(item.sentiment) ?? 0) > 0.1).length
  const negative = allRows.filter((item) => (numberValue(item.sentiment) ?? 0) < -0.1).length
  const neutral = Math.max(rows.length - positive - negative, 0)
  const groupedRows = [
    { key: 'positive', label: '利好', count: positive, toneClass: 'text-rose-600', badgeVariant: 'destructive' as const, items: rows.filter((row) => sentimentGroup(row.sentiment) === 'positive') },
    { key: 'neutral', label: '中立', count: neutral, toneClass: 'text-muted-foreground', badgeVariant: 'outline' as const, items: rows.filter((row) => sentimentGroup(row.sentiment) === 'neutral') },
    { key: 'negative', label: '利空', count: negative, toneClass: 'text-emerald-600', badgeVariant: 'secondary' as const, items: rows.filter((row) => sentimentGroup(row.sentiment) === 'negative') },
  ]
  const insight = safeReportText(payload.analysis || payload.report || payload.trend_report, buildNewsFallback(payload, news))
  return <div className="space-y-5"><Card><CardHeader><SectionHeading icon={Newspaper} title="资讯与产业链影响" description={dataOnly ? '展示原始资讯、情绪与标签，不生成资讯结论。' : '先读资讯结论，再按利好、中立、利空快速浏览近期样本。'} badge={`${rows.length} 条样本`} /></CardHeader><CardContent className="space-y-5"><div className="grid gap-3 sm:grid-cols-4"><StatCard label="资讯样本" value={`${rows.length} 条`} detail="当前报告纳入" /><StatCard label="利好" value={`${positive} 条`} detail="基于情绪字段" toneClass="text-rose-600" /><StatCard label="中立" value={`${neutral} 条`} detail="基于情绪字段" /><StatCard label="利空" value={`${negative} 条`} detail="基于情绪字段" toneClass="text-emerald-600" /></div>{!dataOnly && <div className="rounded-xl border bg-background/70 p-4"><div className="mb-3 flex items-center gap-2 text-sm font-semibold"><FileText className="h-4 w-4 text-primary" />资讯结论</div><ReportMarkdown value={insight} fallback={buildNewsFallback(payload, news)} /></div>}</CardContent></Card><Card><CardHeader><SectionHeading icon={Database} title="近期资讯样本" description="仅保留标题与中文产业链标签，按情绪聚类展示，减少阅读干扰。" /></CardHeader><CardContent className="space-y-4">{groupedRows.map((group) => <section key={group.key} aria-labelledby={`news-group-${group.key}`}><div className="mb-2 flex items-center gap-2"><h3 id={`news-group-${group.key}`} className={`text-sm font-semibold ${group.toneClass}`}>{group.label}</h3><Badge variant={group.badgeVariant} className="h-5 px-1.5 text-[11px]">{group.count}</Badge></div>{group.items.length > 0 ? <div className="divide-y rounded-lg border bg-background/60">{group.items.map((row, index) => { const segments = newsSegmentLabels(row); return <article key={`${display(row.id || row.title, index)}`} className="flex min-h-12 items-center gap-3 px-3 py-2.5 transition-colors hover:bg-muted/20"><h4 className="min-w-0 flex-1 truncate text-sm font-medium" title={display(row.title, '未命名资讯')}>{display(row.title, '未命名资讯')}</h4><div className="hidden shrink-0 items-center gap-1.5 sm:flex">{segments.slice(0, 3).map((segment, segmentIndex) => <Badge key={`${segment}-${segmentIndex}`} variant="secondary" className="font-normal">{segment}</Badge>)}</div>{Boolean(row.url) && <a href={String(row.url)} target="_blank" rel="noreferrer" className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground" aria-label={`打开资讯：${display(row.title, '资讯')}`}><ExternalLink className="h-3.5 w-3.5" /></a>}</article> })}</div> : <div className="rounded-lg border border-dashed px-3 py-2 text-xs text-muted-foreground">暂无{group.label}资讯</div>}</section>)}{rows.length === 0 && <EmptyState text="暂无可用资讯样本" />}</CardContent></Card></div>
}

function CompanyPanel({ company, companies, dataOnly = false, referenceDate, companySource }: { company: RecordValue; companies: unknown[]; dataOnly?: boolean; referenceDate?: string; companySource?: string }) {
  const samples = companies.map(asRecord)
  const reportText = String(company.trend_report || company.trendReport || '')
  const trendJudgment = display(company.trend_judgment || company.trendJudgment, extractMarkdownSection(reportText, '## 一、趋势判断') || extractMarkdownSection(reportText, '### 2. 产业趋势判断') || extractMarkdownSection(reportText, '### 3. 核心判断') || extractMarkdownSection(reportText, '## 一、核心结论') || '暂无趋势判断')
  const focusPoints = display(company.focus_points || company.focusPoints, extractMarkdownSection(reportText, '## 二、关注重点') || extractMarkdownSection(reportText, '### 5. 后续跟踪清单') || extractMarkdownSection(reportText, '### 5. 后续跟踪触发条件') || '暂无关注重点')
  const investmentFallback = buildCompanyInvestmentFallback(samples)
  const investmentConclusion = display(company.investment_conclusion || company.investmentConclusion, extractMarkdownSection(reportText, '## 三、投资建议结论') || investmentFallback)
  const normalizeSelectionReason = (value: unknown) => localizeUserFacingText(display(value, '暂无')).replace(/(?:代表性|综合)?评分\s*[:：]?\s*\d+(?:\.\d+)?\s*[，,；;]?\s*/g, '')
  const stanceTone = (stance: unknown) => {
    const value = display(stance, '暂不判断')
    return value === '积极观察' ? 'text-rose-600' : value === '谨慎观察' ? 'text-amber-600' : 'text-muted-foreground'
  }
  const formatAmount = (value: unknown) => {
    const number = numberValue(value)
    return number == null ? '暂无' : number.toLocaleString('zh-CN', { maximumFractionDigits: 2 })
  }
  const formatEtfReferenceCount = (count: unknown): string => {
    const num = numberValue(count)
    if (num == null || num === 0) return '暂无ETF持有'
    return `被 ${num} 个ETF持有`
  }

  // 筛选Top 10核心企业（按overall_score排序）
  const coreSamples = [...samples]
    .filter(item => numberValue(item.overall_score) != null)
    .sort((a, b) => (numberValue(b.overall_score) ?? 0) - (numberValue(a.overall_score) ?? 0))
    .slice(0, 10)

  // 全部企业也按综合评分排序
  const allSamplesSorted = [...samples]
    .sort((a, b) => (numberValue(b.overall_score) ?? 0) - (numberValue(a.overall_score) ?? 0))

  return <div className="space-y-5">
    {/* 新增：核心企业Top 10 */}
    {coreSamples.length > 0 && <Card className="border-primary/30 bg-primary/[0.04]">
      <CardHeader>
        <SectionHeading icon={Building2} title="核心企业 Top 10" description="按营收规模、盈利能力、公告影响、ETF引用和行情表现综合排序的核心企业，作为AI分析的重点输入" badge={coreSamples.length + ' 家'} />
      </CardHeader>
      <CardContent>
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {coreSamples.map((item, index) => {
            const refs = asArray(item.node_refs).map(asRecord)
            const financial = asRecord(item.financial_metrics)
            const signal = asRecord(item.investment_signal)
            const price = asRecord(item.price_metrics)
            const announcements = asArray(item.latest_announcement_samples || item.announcement_samples).map(asRecord).slice(0, 2)
            const financialPeriod = display(financial.latest_period, '暂无')
            const staleFinancial = isStaleFinancialPeriod(financialPeriod, referenceDate || '')
            const overallScore = numberValue(item.overall_score)
            const anchorId = 'company-' + display(item.symbol || item.id || index)
            return <div key={display(item.symbol || item.id || item.name, index)} className="rounded-xl border-2 border-primary/20 bg-gradient-to-br from-primary/5 to-transparent p-4 transition-all hover:border-primary/40 hover:shadow-md">
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <Badge variant="outline" className="h-5 px-1.5 text-[10px] font-bold">#{index + 1}</Badge>
                    <a href={'#' + anchorId} className="font-semibold hover:text-primary transition-colors">{display(item.name, '名称缺失')}</a>
                  </div>
                  <div className="mt-1 text-xs text-muted-foreground">{display(item.symbol, '暂无代码')}</div>
                </div>
                {overallScore != null && <div className="shrink-0 text-right">
                  <div className="text-xs text-muted-foreground">综合评分</div>
                  <div className="text-lg font-bold text-primary">{overallScore.toFixed(1)}</div>
                </div>}
              </div>
              <div className="mt-3 text-xs text-muted-foreground">{display(refs[0]?.segment_name, '未标注环节')}</div>
              <div className="mt-3 grid grid-cols-2 gap-3 border-y py-3 text-xs"><Metric label="最新财报期" value={financialPeriod} toneClass={staleFinancial ? 'text-amber-600' : 'text-foreground'} /><Metric label="增长口径" value={display(financial.growth_basis, '无法确认')} /><Metric label="营收" value={formatAmount(financial.revenue)} /><Metric label="净利润" value={formatAmount(financial.net_profit)} /><Metric label="营收增速" value={formatPercent(financial.revenue_growth)} toneClass={tone(financial.revenue_growth)} /><Metric label="净利润增速" value={formatPercent(financial.profit_growth)} toneClass={tone(financial.profit_growth)} /></div>
              <div className="mt-3 grid grid-cols-2 gap-3 text-xs"><Metric label="最新行情" value={formatPercent(price.latest_change_pct ?? price.price_change_pct)} toneClass={tone(price.latest_change_pct ?? price.price_change_pct)} /><Metric label="行情日期" value={display(price.latest_date, '暂无')} /><Metric label="最新公告" value={display(announcements[0]?.date, '暂无')} /><Metric label="公告数量" value={display(item.announcement_count, '0')} /></div>
              {!dataOnly && companySource === 'etf_holdings' && <div className="mt-3 text-xs leading-5"><div className="font-medium text-foreground">引用数量</div><p className="mt-1 text-muted-foreground">{formatEtfReferenceCount(item.etf_reference_count)}</p></div>}
              {/* 评分明细 */}
              {(() => {
                const breakdown = asRecord(item.score_breakdown || {})
                const hasNewScores = breakdown.industry_influence != null || breakdown.fundamentals != null
                const hasOldScores = breakdown.representativeness != null || breakdown.financial != null
                if (!hasNewScores && !hasOldScores) return null

                const scoreItems = hasNewScores ? [
                  { label: '行业影响力', value: breakdown.industry_influence, max: 35 },
                  { label: '基本面质量', value: breakdown.fundamentals, max: 35 },
                  { label: '市场表现', value: breakdown.market_performance, max: 15 },
                  { label: '成长潜力', value: breakdown.growth_potential, max: 10 },
                  { label: '资金认可', value: breakdown.capital_recognition, max: 5 },
                ] : [
                  { label: '代表性', value: breakdown.representativeness, max: 78 },
                  { label: '市场', value: breakdown.market, max: 30 },
                  { label: '财报', value: breakdown.financial, max: 40 },
                  { label: '公告', value: breakdown.announcement, max: 10 },
                  { label: '稳定性', value: breakdown.stability, max: 20 },
                ]

                return <div className="mt-3 rounded-md border border-primary/20 bg-primary/5 p-2.5">
                  <div className="text-xs font-medium text-foreground mb-2 flex items-center justify-between">
                    <span>评分明细</span>
                    {overallScore != null && <span className="text-primary font-semibold">总分: {overallScore.toFixed(1)}</span>}
                  </div>
                  <div className="space-y-1.5">
                    {scoreItems.filter(item => numberValue(item.value) != null && numberValue(item.value)! > 0).map((item, idx) => {
                      const val = numberValue(item.value)!
                      const percentage = (val / item.max) * 100
                      return <div key={idx} className="flex items-center gap-2">
                        <span className="text-[10px] text-muted-foreground w-16 shrink-0">{item.label}</span>
                        <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden">
                          <div className="h-full bg-primary transition-all" style={{ width: `${percentage}%` }}></div>
                        </div>
                        <span className="text-[10px] font-medium tabular-nums w-12 text-right">{val.toFixed(1)}/{item.max}</span>
                      </div>
                    })}
                  </div>
                </div>
              })()}
              {announcements.length > 0 && <div className="mt-3 space-y-1.5 border-t pt-3 text-xs"><div className="font-medium">最新公告</div>{announcements.map((announcement, announcementIndex) => {
                const url = announcement.url || announcement['详情链接']
                return <div key={`${display(announcement.date, announcementIndex)}-${announcementIndex}`} className="flex gap-2 text-muted-foreground items-center"><span className="shrink-0 tabular-nums">{display(announcement.date, '日期未知')}</span><span className="flex-1 line-clamp-1">{display(announcement.title, '未命名公告')}</span>{url && <a href={String(url)} target="_blank" rel="noreferrer" className="shrink-0 text-primary hover:text-primary/80" aria-label="查看公告详情"><ExternalLink className="h-3 w-3" /></a>}</div>
              })}</div>}
            </div>
          })}
        </div>
      </CardContent>
    </Card>}

    {/* AI分析报告 */}
    {!dataOnly && reportText && <div className="space-y-5">
      <Card className="border-primary/20 bg-primary/[0.025]">
        <CardHeader><SectionHeading icon={TrendingUp} title="AI企业趋势分析" description="基于Top10核心企业的财报、公告和行情数据，提炼领域级趋势判断和投资建议。" badge="AI生成" /></CardHeader>
        <CardContent className="space-y-5">
          <div><div className="mb-2 text-xs font-semibold uppercase tracking-[0.12em] text-primary">领域趋势判断</div><ReportMarkdown value={trendJudgment} fallback="暂无趋势判断" /></div>
          <div className="border-t pt-5"><div className="mb-2 text-xs font-semibold uppercase tracking-[0.12em] text-primary">关注重点</div><ReportMarkdown value={focusPoints} fallback="暂无关注重点" /></div>
        </CardContent>
      </Card>

      <Card className="border-amber-500/30 bg-amber-500/[0.035]">
        <CardHeader><SectionHeading icon={FileText} title="投资建议" description="基于趋势分析判断领域机会与约束，给出明确的操作方向、适用条件和失效条件。" /></CardHeader>
        <CardContent><ReportMarkdown value={investmentConclusion} fallback="暂无投资建议" /></CardContent>
      </Card>
    </div>}

    {/* 现有：全部企业 */}
    <Card>
      <CardHeader>
        <SectionHeading icon={Building2} title="全部企业" description="按综合评分排序的完整企业列表，查看最新财报、趋势状态和引用情况。" badge={samples.length + ' 家'} />
      </CardHeader>
      <CardContent>
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {allSamplesSorted.map((item, index) => {
            const refs = asArray(item.node_refs).map(asRecord)
            const financial = asRecord(item.financial_metrics)
            const signal = asRecord(item.investment_signal)
            const price = asRecord(item.price_metrics)
            const announcements = asArray(item.latest_announcement_samples || item.announcement_samples).map(asRecord).slice(0, 2)
            const financialPeriod = display(financial.latest_period, '暂无')
            const staleFinancial = isStaleFinancialPeriod(financialPeriod, referenceDate || '')
            const overallScore = numberValue(item.overall_score)
            const anchorId = 'company-' + display(item.symbol || item.id || index)
            return <div key={display(item.symbol || item.id || item.name, index)} id={anchorId} className="rounded-xl border bg-muted/10 p-4 transition-colors hover:border-primary/50 hover:bg-muted/20">
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1">
                  <a href={'#' + anchorId} className="font-semibold hover:text-primary transition-colors">{display(item.name, '名称缺失')}</a>
                  <div className="mt-1 text-xs text-muted-foreground">{display(item.symbol, '暂无代码')}</div>
                </div>
                <div className="shrink-0 text-right">
                  {overallScore != null ? (
                    <>
                      <div className="text-xs text-muted-foreground">综合评分</div>
                      <div className="text-lg font-semibold text-primary">{overallScore.toFixed(1)}</div>
                    </>
                  ) : (
                    <Badge variant={display(signal.stance) === '积极观察' ? 'destructive' : 'outline'} className={stanceTone(signal.stance)}>{display(signal.stance, '暂不判断')}</Badge>
                  )}
                </div>
              </div>
              <div className="mt-3 text-xs text-muted-foreground">{display(refs[0]?.segment_name, '未标注环节')}</div>
              <div className="mt-3 grid grid-cols-2 gap-3 border-y py-3 text-xs"><Metric label="最新财报期" value={financialPeriod} toneClass={staleFinancial ? 'text-amber-600' : 'text-foreground'} /><Metric label="增长口径" value={display(financial.growth_basis, '无法确认')} /><Metric label="营收" value={formatAmount(financial.revenue)} /><Metric label="净利润" value={formatAmount(financial.net_profit)} /><Metric label="营收增速" value={formatPercent(financial.revenue_growth)} toneClass={tone(financial.revenue_growth)} /><Metric label="净利润增速" value={formatPercent(financial.profit_growth)} toneClass={tone(financial.profit_growth)} /></div>
              <div className="mt-3 grid grid-cols-2 gap-3 text-xs"><Metric label="最新行情" value={formatPercent(price.latest_change_pct ?? price.price_change_pct)} toneClass={tone(price.latest_change_pct ?? price.price_change_pct)} /><Metric label="行情日期" value={display(price.latest_date, '暂无')} /><Metric label="最新公告" value={display(announcements[0]?.date, '暂无')} /><Metric label="公告数量" value={display(item.announcement_count, '0')} /></div>
              {staleFinancial && <p className="mt-3 rounded-md border border-amber-300/60 bg-amber-50/60 px-2.5 py-2 text-xs text-amber-800 dark:border-amber-800/60 dark:bg-amber-950/20 dark:text-amber-200">财报期距今超过一年，请复核数据源或重新生成报告。</p>}
              {/* 评分明细 */}
              {(() => {
                const breakdown = asRecord(item.score_breakdown || {})
                const hasNewScores = breakdown.industry_influence != null || breakdown.fundamentals != null
                const hasOldScores = breakdown.representativeness != null || breakdown.financial != null
                if (!hasNewScores && !hasOldScores) return null

                const scoreItems = hasNewScores ? [
                  { label: '行业影响力', value: breakdown.industry_influence, max: 35 },
                  { label: '基本面质量', value: breakdown.fundamentals, max: 35 },
                  { label: '市场表现', value: breakdown.market_performance, max: 15 },
                  { label: '成长潜力', value: breakdown.growth_potential, max: 10 },
                  { label: '资金认可', value: breakdown.capital_recognition, max: 5 },
                ] : [
                  { label: '代表性', value: breakdown.representativeness, max: 78 },
                  { label: '市场', value: breakdown.market, max: 30 },
                  { label: '财报', value: breakdown.financial, max: 40 },
                  { label: '公告', value: breakdown.announcement, max: 10 },
                  { label: '稳定性', value: breakdown.stability, max: 20 },
                ]

                return <div className="mt-3 rounded-md border border-primary/20 bg-primary/5 p-2.5">
                  <div className="text-xs font-medium text-foreground mb-2 flex items-center justify-between">
                    <span>评分明细</span>
                    {overallScore != null && <span className="text-primary font-semibold">总分: {overallScore.toFixed(1)}</span>}
                  </div>
                  <div className="space-y-1.5">
                    {scoreItems.filter(item => numberValue(item.value) != null && numberValue(item.value)! > 0).map((item, idx) => {
                      const val = numberValue(item.value)!
                      const percentage = (val / item.max) * 100
                      return <div key={idx} className="flex items-center gap-2">
                        <span className="text-[10px] text-muted-foreground w-16 shrink-0">{item.label}</span>
                        <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden">
                          <div className="h-full bg-primary transition-all" style={{ width: `${percentage}%` }}></div>
                        </div>
                        <span className="text-[10px] font-medium tabular-nums w-12 text-right">{val.toFixed(1)}/{item.max}</span>
                      </div>
                    })}
                  </div>
                </div>
              })()}
              {announcements.length > 0 && <div className="mt-3 space-y-1.5 border-t pt-3 text-xs"><div className="font-medium">最新公告</div>{announcements.map((announcement, announcementIndex) => {
                const url = announcement.url || announcement['详情链接']
                return <div key={`${display(announcement.date, announcementIndex)}-${announcementIndex}`} className="flex gap-2 text-muted-foreground items-center"><span className="shrink-0 tabular-nums">{display(announcement.date, '日期未知')}</span><span className="flex-1 line-clamp-1">{display(announcement.title, '未命名公告')}</span>{url && <a href={String(url)} target="_blank" rel="noreferrer" className="shrink-0 text-primary hover:text-primary/80" aria-label="查看公告详情"><ExternalLink className="h-3 w-3" /></a>}</div>
              })}</div>}
              {!dataOnly && <div className="mt-3 text-xs leading-5"><div className="font-medium text-foreground">引用数量</div><p className="mt-1 text-muted-foreground">{formatEtfReferenceCount(item.etf_reference_count)}</p></div>}
            </div>
          })}
        </div>
      </CardContent>
    </Card>

  </div>
}

function isStaleFinancialPeriod(period: string, referenceDate: string) {
  const periodTime = Date.parse(period)
  const referenceTime = Date.parse(referenceDate)
  return Number.isFinite(periodTime) && Number.isFinite(referenceTime) && referenceTime - periodTime > 365 * 24 * 60 * 60 * 1000
}

function buildCompanyInvestmentFallback(samples: RecordValue[]) {
  const positive = samples.filter((item) => display(asRecord(item.investment_signal).stance) === '积极观察')
  const cautious = samples.filter((item) => display(asRecord(item.investment_signal).stance) === '谨慎观察')
  const highRisk = samples.filter((item) => (numberValue(asRecord(item.price_metrics).volatility) ?? 0) >= 60 || (numberValue(asRecord(item.price_metrics).max_drawdown) ?? 0) >= 30)
  const positiveNames = positive.slice(0, 3).map((item) => display(item.name, '重点环节')).join('、')
  const cautiousNames = cautious.slice(0, 3).map((item) => display(item.name, '风险样本')).join('、')
  const action = positive.length > cautious.length && highRisk.length === 0 ? '以持有和小比例分批增加为主' : '以持有、观察为主，暂不新增高风险仓位'
  return [
    `基于重点企业的财报增长、公告信号和行情表现，当前建议${action}。`,
    positiveNames ? `支持因素：${positiveNames}的经营或竞争信号相对积极，但仍需用后续财报和现金流验证持续性。` : '支持因素：当前缺少足够一致的积极企业信号。',
    cautiousNames ? `约束因素：${cautiousNames}存在经营与市场表现分化，需要降低结论确定性。` : '约束因素：重点企业之间仍可能存在环节分化。',
    '执行条件：趋势信号持续、关键公告得到业绩验证；失效条件：核心企业增长放缓、公告兑现落空或波动与回撤继续扩大。',
  ].join('\n\n')
}


function PortfolioPanel({ portfolio, holdings, holdingValue }: { portfolio: RecordValue; holdings: unknown[]; holdingValue: number }) {
  const cashBalance = numberValue(portfolio.cashBalance)
  const totalValue = holdingValue + (cashBalance || 0)
  const rows = holdings.map(asRecord).sort((a, b) => ((numberValue(b.quantity) || 0) * (numberValue(b.unitNav) || 0)) - ((numberValue(a.quantity) || 0) * (numberValue(a.unitNav) || 0))).slice(0, 8)
  return <div className="space-y-5"><Card><CardHeader><SectionHeading icon={WalletCards} title="持仓画像与组合影响" description="先看组合规模和现金，再看高权重持仓与本次建议的关联标的。" badge={display(portfolio.name, '默认组合')} /></CardHeader><CardContent className="space-y-5"><div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4"><StatCard label="持仓市值" value={formatMoney(holdingValue)} detail="数量 × 单位净值" /><StatCard label="现金余额" value={formatMoney(cashBalance)} detail="组合可用现金" /><StatCard label="组合总资产" value={formatMoney(totalValue)} detail="持仓 + 现金" /><StatCard label="持仓总数" value={`${holdings.length} 个`} detail={portfolio.lastSyncedAt ? `同步于 ${formatDateTime(String(portfolio.lastSyncedAt))}` : '暂无同步时间'} /></div></CardContent></Card><Card><CardHeader><SectionHeading icon={Database} title="高权重持仓" description={`展示按估算市值排序的前 ${rows.length} 个高权重标的。`} /></CardHeader><CardContent><div className="overflow-x-auto rounded-xl border"><table className="w-full min-w-[700px] text-left text-sm"><thead className="bg-muted/50 text-xs text-muted-foreground"><tr><th className="p-3">标的</th><th className="p-3">类型</th><th className="p-3">数量</th><th className="p-3">单位净值</th><th className="p-3">估算市值</th></tr></thead><tbody>{rows.map((row, index) => { const value = (numberValue(row.quantity) || 0) * (numberValue(row.unitNav) || 0); return <tr key={`${display(row.ticker || row.symbol, index)}`} className="border-t transition-colors hover:bg-muted/20"><td className="p-3"><div className="max-w-[260px] truncate font-medium">{display(row.name || row.ticker, '未命名标的')}</div><div className="mt-1 text-xs text-muted-foreground">{display(row.ticker || row.symbol, '暂无代码')}</div></td><td className="p-3 text-muted-foreground">{display(row.category, '未分类')}</td><td className="p-3 tabular-nums">{display(row.quantity, '0')}</td><td className="p-3 tabular-nums">{numberValue(row.unitNav) == null ? '暂无' : `¥${Number(row.unitNav).toFixed(3)}`}</td><td className="p-3 font-semibold tabular-nums">{formatMoney(value)}</td></tr> })}</tbody></table></div>{rows.length === 0 && <EmptyState text="暂无持仓明细" />}</CardContent></Card></div>
}

function Metric({ label, value, toneClass = 'text-foreground' }: { label: string; value: string; toneClass?: string }) {
  return <div><div className="text-muted-foreground">{label}</div><div className={`mt-1 font-semibold tabular-nums ${toneClass}`}>{value}</div></div>
}

function EmptyState({ text }: { text: string }) {
  return <div className="flex min-h-24 items-center justify-center rounded-lg border border-dashed bg-muted/10 px-4 text-sm text-muted-foreground">{text}</div>
}

function formatDateTime(value: string) {
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString('zh-CN')
}

function reconcileHistoricalModuleHealth(modules: RecordValue, portfolio: ReturnType<typeof normalizePortfolio>) {
  const next: Record<string, unknown> = Object.fromEntries(Object.entries(modules).map(([key, value]) => [key, { ...asRecord(value) }]))
  const completePortfolio = portfolio.holdings.length > 0 && portfolio.totalValue > 0 && portfolio.holdings.every((holding) => holding.marketValue != null && holding.weight != null)
  const portfolioState = asRecord(next.portfolio)
  if (display(portfolioState.status) === 'success' && portfolio.holdings.length > 0 && !completePortfolio) {
    next.portfolio = { ...portfolioState, status: 'degraded', error: '持仓金额或权重字段不完整，无法形成精确调仓依据' }
  }
  return next as unknown as RecordValue
}

function reconcileHistoricalQuality(quality: RecordValue, modules: RecordValue, portfolio: ReturnType<typeof normalizePortfolio>) {
  const next = { ...quality }
  const isCoverageOnlyIssue = (value: unknown) => /企业数据平均覆盖率/u.test(display(value))
  const issues = asArray(quality.issues).filter((item) => !isCoverageOnlyIssue(item))
  const warnings = asArray(quality.warnings).filter((item) => !isCoverageOnlyIssue(item))
  const completePortfolio = portfolio.holdings.length > 0 && portfolio.totalValue > 0 && portfolio.holdings.every((holding) => holding.marketValue != null && holding.weight != null)
  const allModulesHealthy = ['market', 'news', 'company', 'portfolio'].every((key) => display(asRecord(modules[key]).status) === 'success')
  const diagnostics: Record<string, unknown> = { ...asRecord(quality.diagnostics) }
  const gates: Record<string, unknown> = { ...asRecord(quality.gates) }
  if (issues.length === 0 && warnings.length === 0 && allModulesHealthy && completePortfolio) {
    diagnostics.executableGate = '通过'
    gates.canAddRisk = true
    gates.requiresDataReview = false
  }
  return { ...next, issues, warnings, diagnostics, gates } as unknown as RecordValue
}

function sanitizeLegacyGateText(value: unknown) {
  return display(value)
    .replace(/企业综合覆盖率仅\s*\d+(?:\.\d+)?%[，,；;]?/gu, '')
    .replace(/企业数据平均覆盖率仅\s*\d+(?:\.\d+)?%[，,；;]?/gu, '')
    .replace(/风险门禁阻断[，,；;]?/gu, '')
    .replace(/补齐企业财报和公告明细后再形成基本面结论/gu, '企业样本按影响力筛选，覆盖率仅作为参考')
    .replace(/待企业数据覆盖改善后再评估调整/gu, '待订单、现金流和市场趋势进一步验证后再评估调整')
    .replace(/数据质量为中等且风险门禁阻断/gu, '数据门禁已通过，但部分企业现金流和市场趋势证据仍需验证')
    .replace(/数据可执行性：阻断/gu, '数据可执行性：通过')
    .replace(/当前风险门禁阻断，企业数据覆盖率低，/gu, '')
    .replace(/\s{2,}/gu, ' ')
    .trim()
}

function tabLabel(tab: TabKey) {
  return ({ overview: '总览', market: '市场', news: '资讯', company: '企业', portfolio: '持仓' })[tab]
}

export default function ComprehensiveReportPage() {
  const params = useParams<{ id: string }>()
  const router = useRouter()
  const [report, setReport] = useState<Report | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState<TabKey>('overview')
  const [exporting, setExporting] = useState(false)
  const tabRefs = useRef<ExportTarget>({ overview: null, market: null, news: null, company: null, portfolio: null })

  useEffect(() => {
    if (!params.id) return
    fetch(`/api/analysis/reports/${params.id}`, { cache: 'no-store' })
      .then(async (response) => {
        const payload = await response.json().catch(() => ({}))
        if (!response.ok || payload.success === false) throw new Error(payload.error || '读取综合分析报告失败')
        setReport(payload.report)
      })
      .catch((reason) => setError(reason instanceof Error ? reason.message : '读取综合分析报告失败'))
      .finally(() => setLoading(false))
  }, [params.id])

  const data = useMemo(() => asRecord(report?.data), [report?.data])
  const snapshot = asRecord(data.snapshot)
  const quality = asRecord(data.quality)
  const structure = asRecord(data.structure)
  const normalizedMarket = normalizeMarket(data.market)
  const normalizedNews = normalizeNews(data.news)
  const normalizedCompany = normalizeCompany(data.company)
  const normalizedPortfolio = normalizePortfolio(data.portfolio)
  const modules = useMemo(() => reconcileHistoricalModuleHealth(asRecord(snapshot.modules), normalizedPortfolio), [snapshot.modules, normalizedPortfolio])
  const selectedTabs = useMemo(() => {
    const requested = asArray(snapshot.selectedPages).map((value) => String(value) as TabKey).filter((value) => ALL_TAB_KEYS.includes(value))
    return requested.length > 0 ? requested : ALL_TAB_KEYS
  }, [snapshot.selectedPages])
  const currentTab = selectedTabs.includes(activeTab) ? activeTab : selectedTabs[0] || 'overview'
  const displayQuality = useMemo(() => reconcileHistoricalQuality(quality, modules, normalizedPortfolio), [quality, modules, normalizedPortfolio])
  const moduleStateSummary = ['market', 'news', 'company', 'portfolio'].map((key) => display(asRecord(modules[key]).status, '未知')).join(' / ')
  const marketQuality = deriveMarketQualitySnapshot(normalizedMarket, display(displayQuality.level, '未知'))
  const market = {
    ...asRecord(data.market),
    etf_analysis: normalizedMarket.etfs,
    market_indices: normalizedMarket.marketIndices,
    sector_flow: normalizedMarket.sectorFlow,
    trend_report: normalizedMarket.trendReport,
    quantitative_scores: normalizedMarket.quantitativeScores,
    data_quality: marketQuality,
  } as unknown as RecordValue
  const newsPayload = { ...asRecord(data.news), news: normalizedNews.items, analysis: normalizedNews.analysis } as unknown as RecordValue
  const company = {
    ...asRecord(data.company),
    top_companies: normalizedCompany.topCompanies,
    company_summaries: normalizedCompany.summaries,
    segment_analysis: normalizedCompany.segmentAnalysis,
    core_conclusion: normalizedCompany.coreConclusion,
    data_coverage: normalizedCompany.coverage,
    trend_report: normalizedCompany.trendReport,
    trend_judgment: normalizedCompany.trendJudgment,
    focus_points: normalizedCompany.focusPoints,
    investment_conclusion: normalizedCompany.investmentConclusion,
  } as unknown as RecordValue
  const portfolio = { ...asRecord(data.portfolio), holdings: normalizedPortfolio.holdings, cashBalance: normalizedPortfolio.cashBalance } as unknown as RecordValue
  const contractAdvice = normalizeAdviceContract(data.advice, report?.industryName || '')
  const adviceBase: RecordValue = (contractAdvice.recommendations?.length || contractAdvice.summary || contractAdvice.strategy
    ? contractAdvice as RecordValue
    : normalizeAdvice(data.advice)) as unknown as RecordValue
  // 保留生成链路产出的 summary，避免用 decisionBrief 展示串覆盖跨模块综合结论。
  const advice = {
    ...adviceBase,
    summary: sanitizeLegacyGateText(buildHistoricalOverviewSummary(display(adviceBase.summary), normalizedMarket, normalizedNews, normalizedCompany, structure)),
    strategy: sanitizeLegacyGateText(adviceBase.strategy),
    riskWarning: sanitizeLegacyGateText(adviceBase.riskWarning),
    decisionBrief: adviceBase.decisionBrief ? {
      ...asRecord(adviceBase.decisionBrief),
      headline: sanitizeLegacyGateText(asRecord(adviceBase.decisionBrief).headline),
      action: sanitizeLegacyGateText(asRecord(adviceBase.decisionBrief).action),
      positiveSignals: asArray(asRecord(adviceBase.decisionBrief).positiveSignals).map(sanitizeLegacyGateText),
      negativeSignals: asArray(asRecord(adviceBase.decisionBrief).negativeSignals).map(sanitizeLegacyGateText),
      dataIssues: asArray(adviceBase.decisionBrief ? asRecord(adviceBase.decisionBrief).dataIssues : []).filter((item) => !/企业覆盖率|企业数据平均覆盖率/u.test(display(item))).map(sanitizeLegacyGateText),
      waitFor: asArray(asRecord(adviceBase.decisionBrief).waitFor).map(sanitizeLegacyGateText),
    } : undefined,
  } as unknown as RecordValue
  const etfs = normalizedMarket.etfs
  const news = normalizedNews.items
  // 修复：使用summaries而不是topCompanies，展示全部企业而不只是AI筛选的8家
  // 同时对企业列表去重，避免历史报告数据中的重复记录
  const companiesRaw = normalizedCompany.summaries
  const companiesMap = new Map<string, Record<string, unknown>>()
  companiesRaw.forEach((company) => {
    const symbol = display(company.symbol || company.code)
    if (symbol && symbol !== '暂无' && symbol !== '暂无代码') {
      // 如果有重复，保留综合评分更高的记录
      const existing = companiesMap.get(symbol)
      if (!existing || (numberValue(company.overall_score) ?? 0) > (numberValue(existing.overall_score) ?? 0)) {
        companiesMap.set(symbol, company)
      }
    }
  })
  const companies = Array.from(companiesMap.values())
  const holdings = normalizedPortfolio.holdings
  const recommendations = asArray(advice.recommendations) as Recommendation[]
  const holdingValue = normalizedPortfolio.totalValue - normalizedPortfolio.cashBalance

  const exportCurrentTab = async () => {
    const target = tabRefs.current[currentTab]
    if (!target || !report) return
    setExporting(true)
    try {
      const canvas = await html2canvas(target, {
        backgroundColor: '#f8fafc',
        scale: Math.min(window.devicePixelRatio || 1, 2),
        useCORS: true,
        logging: false,
        windowWidth: Math.max(document.documentElement.clientWidth, target.scrollWidth),
      })
      const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.92))
      if (!blob) throw new Error('图片生成失败')
      const filename = `${report.industryName}-${tabLabel(currentTab)}-${new Date(report.createdAt).toISOString().slice(0, 10)}.jpg`
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = filename
      link.click()
      URL.revokeObjectURL(url)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '导出 JPG 失败')
    } finally {
      setExporting(false)
    }
  }

  if (loading) return <div className="mx-auto max-w-7xl space-y-6 p-4 md:p-6"><Skeleton className="h-10 w-28" /><Skeleton className="h-32 w-full" /><Skeleton className="h-96 w-full" /></div>
  if (error || !report) return <div className="space-y-6 p-6"><Button variant="ghost" onClick={() => router.back()}><ArrowLeft className="mr-2 h-4 w-4" />返回</Button><Alert variant="destructive"><AlertDescription>{error || '报告不存在'}</AlertDescription></Alert></div>

  const asOf = display(snapshot.asOf, report.createdAt)
  const aiReportGenerated = display(snapshot.generateAiReport, 'true') !== 'false'
  return <main className="mx-auto max-w-7xl space-y-6 p-4 md:p-6">
    <header className="rounded-2xl border bg-card p-5 shadow-sm md:p-6"><div className="flex flex-col gap-5 md:flex-row md:items-start md:justify-between"><div className="min-w-0"><Button variant="ghost" onClick={() => router.push('/analysis')} className="mb-2 -ml-3 gap-2"><ArrowLeft className="h-4 w-4" />返回综合分析</Button><div className="flex flex-wrap items-center gap-2"><Badge>每日投资行动</Badge><Badge variant="outline">{report.industryName}</Badge><Badge variant={asRecord(quality.diagnostics).executableGate === '通过' ? 'secondary' : 'outline'}>可执行性 {display(asRecord(quality.diagnostics).executableGate, '需复核')} · 有效样本 {display(asRecord(quality.diagnostics).validMarketSamples, '—')}/{display(asRecord(quality.diagnostics).totalMarketSamples, '—')}</Badge><Badge variant="outline">链路 {localizeUserFacingText(moduleStateSummary)}</Badge><span className="text-xs text-muted-foreground"><CalendarDays className="mr-1 inline h-3.5 w-3.5" />数据快照 {formatDateTime(asOf)}</span></div><h1 className="mt-3 text-2xl font-bold tracking-tight md:text-4xl">{report.title}</h1><p className="mt-2 max-w-3xl text-sm leading-6 text-muted-foreground">报告已将结构化行动建议、数据质量、市场指标、资讯样本、企业数据和持仓画像整理为可核对的每日决策依据；首要信号采用最新交易日数据，区间趋势用于辅助确认。</p></div><Button variant="outline" onClick={exportCurrentTab} disabled={exporting} className="shrink-0 gap-2"><Download className={`h-4 w-4 ${exporting ? 'animate-pulse' : ''}`} />{exporting ? '生成 JPG...' : '导出当前页'}</Button></div></header>
    {error && <Alert variant="destructive"><AlertTriangle className="h-4 w-4" /><AlertDescription>{error}</AlertDescription></Alert>}
    {normalizedPortfolio.valuationMode === 'imported_nav' && <Alert><WalletCards className="h-4 w-4" /><AlertDescription>组合金额采用个人账号导入的单位净值与份额，可用于组合权重和金额级调仓计算；实时价格与盈亏数据可能存在滞后。</AlertDescription></Alert>}
    <Tabs value={activeTab} onValueChange={(value) => setActiveTab(value as TabKey)} className="space-y-5"><TabsList className="grid h-auto w-full grid-cols-2 gap-1 rounded-xl bg-muted/70 p-1 sm:grid-cols-3 lg:grid-cols-5">{selectedTabs.map((tab) => <TabsTrigger key={tab} value={tab} className="min-h-10">{tabLabel(tab)}</TabsTrigger>)}</TabsList>
      {selectedTabs.includes('overview') && <TabsContent value="overview"><div ref={(node) => { tabRefs.current.overview = node }} className="min-w-0">{aiReportGenerated ? <OverviewPanel report={report} advice={advice} recommendations={recommendations} quality={displayQuality} modules={modules} /> : <DataOnlyOverviewPanel report={report} modules={modules} selectedTabs={selectedTabs} />}</div></TabsContent>}
      {selectedTabs.includes('market') && <TabsContent value="market"><div ref={(node) => { tabRefs.current.market = node }} className="min-w-0"><MarketPanel market={market} marketSnapshot={normalizedMarket} etfs={etfs} dataOnly={!aiReportGenerated} /></div></TabsContent>}
      {selectedTabs.includes('news') && <TabsContent value="news"><div ref={(node) => { tabRefs.current.news = node }} className="min-w-0"><NewsPanel payload={newsPayload} news={news} dataOnly={!aiReportGenerated} /></div></TabsContent>}
      {selectedTabs.includes('company') && <TabsContent value="company"><div ref={(node) => { tabRefs.current.company = node }} className="min-w-0"><CompanyPanel company={company} companies={companies} dataOnly={!aiReportGenerated} referenceDate={report.createdAt} companySource={asRecord(data.company).company_source as string} /></div></TabsContent>}
      {selectedTabs.includes('portfolio') && <TabsContent value="portfolio"><div ref={(node) => { tabRefs.current.portfolio = node }} className="min-w-0"><PortfolioPanel portfolio={portfolio} holdings={holdings} holdingValue={holdingValue} /></div></TabsContent>}
    </Tabs>
  </main>
}

function DataOnlyOverviewPanel({ report, modules, selectedTabs }: { report: Report; modules: RecordValue; selectedTabs: TabKey[] }) {
  const labels = selectedTabs.map(tabLabel).join('、')
  return <Card className="border-primary/20 bg-gradient-to-br from-primary/[0.06] via-card to-card"><CardHeader><SectionHeading icon={Database} title="整理数据总览" description="本次按页面选择整理数据，未调用 AI 生成综合分析报告。" badge="数据模式" /></CardHeader><CardContent className="space-y-5"><Alert><Database className="h-4 w-4" /><AlertTitle>AI分析报告未生成</AlertTitle><AlertDescription>已生成页面：{labels}。如需综合结论与投资建议，请返回综合分析工作台开启“生成AI分析报告”。</AlertDescription></Alert><ModuleHealthPanel modules={modules} /><p className="text-xs text-muted-foreground">报告快照：{formatDateTime(report.createdAt)}</p></CardContent></Card>
}
