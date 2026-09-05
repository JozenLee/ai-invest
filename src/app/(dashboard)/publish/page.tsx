'use client'

import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore, type Dispatch, type SetStateAction } from 'react'
import {
  AlertCircle,
  BadgeCheck,
  BarChart3,
  CalendarClock,
  Check,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  FileImage,
  FileText,
  Globe2,
  Info,
  Loader2,
  Plus,
  RefreshCw,
  Send,
  Settings2,
  Sparkles,
  Tags,
  UserRound,
  Users,
} from 'lucide-react'
import {
  AI_ANALYSIS_MODULES,
  buildAIAnalysisEndpoint,
  buildAnalysisReportPayload,
  getAIAnalysisModule,
  type AIAnalysisModuleId,
} from '@/config/ai-analysis-modules'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { Separator } from '@/components/ui/separator'
import { Textarea } from '@/components/ui/textarea'
import { PublishScheduleDialog } from '@/components/PublishScheduleDialog'
import { cn } from '@/lib/utils'

type ModuleStatus = 'ready' | 'running' | 'done'
type AccountView = 'connected' | 'new'
type PublishStage = 'idle' | 'checking' | 'publishing' | 'success' | 'failure'

interface Industry { id: string; name: string; description?: string }
interface PublishAccount {
  id: string
  displayName: string
  accountId: string
  authType: 'personal_app'
  defaultVisibility: 'public' | 'private'
  allowComments: boolean
  watermarkEnabled: boolean
  defaultTopics: string[]
  enabled: boolean
  isConfigured: boolean
  lastVerifiedAt: string | null
  lastVerifyError: string | null
}
interface ReportSlide {
  moduleId: AIAnalysisModuleId
  title: string
  content: string
  imageDataUrl: string
}

interface PreviewItem {
  id: string
  title: string
  imageDataUrl: string
  kind: 'cover' | 'report'
  moduleId?: AIAnalysisModuleId
}

type PublishVisibility = '公开可见' | '仅自己可见'

interface PublishOptions {
  visibility: PublishVisibility
  scheduleAt: string
  isOriginal: boolean
  relatedTopics: string
}

const MODULE_COLORS: Record<AIAnalysisModuleId, string> = {
  market: 'from-cyan-500 to-teal-500',
  news: 'from-rose-500 to-pink-500',
  company: 'from-indigo-500 to-blue-500',
  comprehensive: 'from-emerald-500 to-green-500',
}

const FALLBACK_COPY = '本期分析已完成，建议结合产业趋势、市场表现与企业变化综合判断。关注景气度持续性、估值匹配度和后续数据验证，避免仅依据单一指标做出决策。'
const PUBLISH_DRAFT_STORAGE_KEY = 'ai-invest.publish.latest-draft.v1'

interface PublishDraft {
  selectedDomain: string
  selectedModules: AIAnalysisModuleId[]
  title: string
  summary: string
  slides: ReportSlide[]
  coverImageDataUrl: string
  currentSlide: number
}

function readPublishDraft(): Partial<PublishDraft> {
  if (typeof window === 'undefined') return {}
  try {
    const saved = window.localStorage.getItem(PUBLISH_DRAFT_STORAGE_KEY)
    return saved ? JSON.parse(saved) as Partial<PublishDraft> : {}
  } catch {
    return {}
  }
}

const EMPTY_PUBLISH_DRAFT: Partial<PublishDraft> = {}
let publishDraftSnapshot: Partial<PublishDraft> | null = null

function subscribeToPublishDraft() {
  return () => undefined
}

function getPublishDraftSnapshot() {
  if (typeof window === 'undefined') return EMPTY_PUBLISH_DRAFT
  if (!publishDraftSnapshot) publishDraftSnapshot = readPublishDraft()
  return publishDraftSnapshot
}

function stripMarkdown(value: string) {
  return value
    .replace(/```(?:[a-zA-Z0-9_-]+\n)?([\s\S]*?)```/g, '$1')
    .replace(/<[^>]+>/g, '')
    .replace(/^#{1,6}\s*/gm, '')
    .replace(/^\s*>\s?/gm, '')
    .replace(/\*\*(.*?)\*\*/g, '$1')
    .replace(/__(.*?)__/g, '$1')
    .replace(/\*([^*]+)\*/g, '$1')
    .replace(/_([^_]+)_/g, '$1')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/^\s*[-*_]{3,}\s*$/gm, '')
    .replace(/\|/g, ' ')
    .replace(/^\s*[-*+]\s+/gm, '• ')
    .replace(/^\s*(\d+)[.)]\s+/gm, '$1. ')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

function escapeXml(value: string) {
  return value.replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' })[character] || character)
}

function getCharacterWidth(character: string, fontSize: number) {
  return /[\u0000-\u00ff]/.test(character) ? fontSize * 0.56 : fontSize
}

function wrapPreviewText(value: string, maxWidth: number, fontSize: number) {
  const normalized = value.replace(/\r/g, '').trim()
  const lines: string[] = []
  normalized.split('\n').forEach((paragraph) => {
    if (!paragraph) { lines.push(''); return }
    let line = ''
    let lineWidth = 0
    for (const character of Array.from(paragraph)) {
      const characterWidth = getCharacterWidth(character, fontSize)
      if (line && lineWidth + characterWidth > maxWidth) {
        lines.push(line)
        line = ''
        lineWidth = 0
      }
      line += character
      lineWidth += characterWidth
    }
    if (line) lines.push(line)
  })
  return lines.length ? lines : ['']
}

function textLinesMarkup(lines: string[], x: number, y: number, lineHeight: number) {
  return lines.map((line, index) => `<tspan x="${x}" y="${index === 0 ? y : y + index * lineHeight}">${escapeXml(line || ' ')}</tspan>`).join('')
}

function decoratePreviewContent(value: string) {
  return value
    .replace(/(^|\n)\s*一、核心结论\s*[:：]?/g, '$1📌 核心结论：')
    .replace(/(^|\n)\s*二、关键事实\s*[:：]?/g, '$1🔎 关键事实：')
    .replace(/(^|\n)\s*三、产业影响\s*[:：]?/g, '$1🏭 产业影响：')
    .replace(/(^|\n)\s*四、机会与风险\s*[:：]?/g, '$1🚀 机会与风险：')
    .replace(/(^|\n)\s*五、关注清单\s*[:：]?/g, '$1👀 关注清单：')
    .replace(/(^|\n)\s*六、风险提示\s*[:：]?/g, '$1⚠️ 风险提示：')
    .replace(/(^|\n)\s*核心判断\s*[:：]?/g, '$1📌 核心判断：')
    .replace(/(^|\n)\s*关键变化\s*[:：]?/g, '$1🔎 关键变化：')
    .replace(/(^|\n)\s*后续关注\s*[:：]?/g, '$1👀 后续关注：')
}

async function renderPreviewImage(options: { kind: 'cover' | 'report'; domainName: string; title: string; content: string; moduleCount: number }) {
  const width = 1440
  const isCover = options.kind === 'cover'
  const titleFontSize = isCover ? 68 : 62
  const contentFontSize = isCover ? 34 : 32
  const titleLineHeight = isCover ? 88 : 80
  const contentLineHeight = isCover ? 58 : 54
  const titleLines = wrapPreviewText(options.title, 1248, titleFontSize)
  const contentLines = wrapPreviewText(decoratePreviewContent(options.content), 1170, contentFontSize)
  const titleY = isCover ? 420 : 430
  const contentY = isCover ? titleY + titleLines.length * titleLineHeight + 170 : titleY + titleLines.length * titleLineHeight + 130
  const footerY = Math.max(isCover ? 1500 : 1500, contentY + contentLines.length * contentLineHeight + 140)
  const height = footerY + 180
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
    <defs><linearGradient id="hero" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#0f172a"/><stop offset="0.58" stop-color="#172554"/><stop offset="1" stop-color="#155e75"/></linearGradient></defs>
    <rect width="${width}" height="${height}" fill="#0b1220"/>
    <rect width="${width}" height="${Math.max(isCover ? 700 : 620, contentY - 80)}" fill="url(#hero)"/>
    <circle cx="1180" cy="190" r="260" fill="#22d3ee" opacity=".12"/><circle cx="1300" cy="500" r="180" fill="#34d399" opacity=".1"/>
    <text x="96" y="130" fill="#67e8f9" font-size="28" font-family="Arial, sans-serif" letter-spacing="8">AI INVESTMENT BRIEF</text>
    <text x="96" y="250" fill="#f8fafc" font-size="34" font-family="Arial, sans-serif">${escapeXml(options.domainName || '投资研究')}</text>
    <text fill="#f8fafc" font-size="${titleFontSize}" font-weight="700" font-family="Arial, Microsoft YaHei, sans-serif">${textLinesMarkup(titleLines, 96, titleY, titleLineHeight)}</text>
    <rect x="64" y="${contentY - 90}" width="1312" height="${contentLines.length * contentLineHeight + 150}" rx="32" fill="#111c33" stroke="#334155" stroke-width="2"/>
    <rect x="96" y="${contentY - 48}" width="12" height="${Math.max(64, contentLines.length * contentLineHeight + 54)}" rx="6" fill="#22d3ee"/>
    <text x="140" y="${contentY - 38}" fill="#67e8f9" font-size="24" font-weight="700" font-family="Arial, Microsoft YaHei, sans-serif">${isCover ? '✨ 本期导读' : '📚 研究要点'}</text>
    <text fill="#e2e8f0" font-size="${contentFontSize}" font-family="Arial, Microsoft YaHei, sans-serif">${textLinesMarkup(contentLines, 140, contentY + 16, contentLineHeight)}</text>
    <line x1="96" y1="${footerY}" x2="1344" y2="${footerY}" stroke="#334155" stroke-width="2"/>
    <rect x="96" y="${footerY + 42}" width="1248" height="64" rx="32" fill="#172554" stroke="#1e40af" stroke-width="1"/>
    <text x="128" y="${footerY + 82}" fill="#bfdbfe" font-size="26" font-family="Arial, Microsoft YaHei, sans-serif">📊 ${options.moduleCount} 个报告章节　·　🤖 AI 研究引擎</text>
    <text x="96" y="${footerY + 140}" fill="#64748b" font-size="24" font-family="Arial, Microsoft YaHei, sans-serif">数据研究 · 风险提示 · 仅供交流</text>
  </svg>`
  const image = new Image()
  const imageUrl = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`
  await new Promise<void>((resolve, reject) => {
    image.onload = () => resolve()
    image.onerror = () => reject(new Error('预览图片渲染失败'))
    image.src = imageUrl
  })
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const context = canvas.getContext('2d')
  if (!context) throw new Error('预览图片画布初始化失败')
  context.drawImage(image, 0, 0, width, height)
  return canvas.toDataURL('image/jpeg', 0.88)
}

function PublishOptionsCard({ options, setOptions, domainName, defaultTopics, scheduleMin }: { options: PublishOptions; setOptions: Dispatch<SetStateAction<PublishOptions>>; domainName?: string; defaultTopics: string[]; scheduleMin: string }) {
  const topicPreview = Array.from(new Set([...defaultTopics, domainName || '', ...options.relatedTopics.split(/[,，#\s]+/)].map((topic) => topic.trim().replace(/^#/, '')).filter(Boolean))).slice(0, 10)
  return <Card className="overflow-hidden border-primary/15 shadow-sm"><CardHeader className="border-b bg-gradient-to-r from-primary/[0.07] via-background to-background pb-4"><div className="flex items-start justify-between gap-3"><div><CardTitle className="flex items-center gap-2 text-lg"><Settings2 className="h-5 w-5 text-primary" />发布配置</CardTitle><CardDescription className="mt-1">发布前调整可见范围、发布时间和关联话题。</CardDescription></div><span className="rounded-full border border-primary/20 bg-primary/5 px-2.5 py-1 text-xs font-medium text-primary">MCP</span></div></CardHeader><CardContent className="space-y-5 pt-5"><div className="space-y-2"><Label className="flex items-center gap-2"><Globe2 className="h-4 w-4 text-muted-foreground" />可见范围</Label><div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label="可见范围"><button type="button" role="radio" aria-checked={options.visibility === '公开可见'} onClick={() => setOptions((current) => ({ ...current, visibility: '公开可见' }))} className={cn('min-h-11 rounded-lg border px-3 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary', options.visibility === '公开可见' ? 'border-primary bg-primary/10 text-primary' : 'bg-background text-muted-foreground hover:border-primary/40 hover:text-foreground')}>公开可见</button><button type="button" role="radio" aria-checked={options.visibility === '仅自己可见'} onClick={() => setOptions((current) => ({ ...current, visibility: '仅自己可见' }))} className={cn('min-h-11 rounded-lg border px-3 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary', options.visibility === '仅自己可见' ? 'border-primary bg-primary/10 text-primary' : 'bg-background text-muted-foreground hover:border-primary/40 hover:text-foreground')}>仅自己可见</button></div></div><div className="space-y-2"><Label htmlFor="publish-schedule" className="flex items-center gap-2"><CalendarClock className="h-4 w-4 text-muted-foreground" />定时发布<span className="font-normal text-muted-foreground">（可选）</span></Label><input id="publish-schedule" type="datetime-local" value={options.scheduleAt} min={scheduleMin} onChange={(event) => setOptions((current) => ({ ...current, scheduleAt: event.target.value }))} className="h-11 w-full rounded-lg border bg-background px-3 text-sm outline-none transition-colors focus:border-primary focus:ring-2 focus:ring-primary/20" />{options.scheduleAt ? <p className="text-xs text-primary">将在设定时间提交到小红书 MCP。</p> : <p className="text-xs text-muted-foreground">留空则立即发布。</p>}</div><div className="space-y-2"><Label htmlFor="publish-topics" className="flex items-center gap-2"><Tags className="h-4 w-4 text-muted-foreground" />关联领域 / 话题</Label><input id="publish-topics" value={options.relatedTopics} onChange={(event) => setOptions((current) => ({ ...current, relatedTopics: event.target.value }))} placeholder="输入多个话题，用逗号、空格或 # 分隔" className="h-11 w-full rounded-lg border bg-background px-3 text-sm outline-none transition-colors focus:border-primary focus:ring-2 focus:ring-primary/20" /><div className="flex min-h-7 flex-wrap gap-1.5" aria-label="当前话题预览">{topicPreview.length ? topicPreview.map((topic) => <span key={topic} className="rounded-full bg-muted px-2.5 py-1 text-xs text-muted-foreground">#{topic}</span>) : <span className="text-xs text-muted-foreground">生成内容后会自动带入当前分析领域</span>}</div><p className="text-xs text-muted-foreground">默认包含账号话题和当前分析领域，最多提交 10 个标签。</p></div><label className="flex min-h-11 cursor-pointer items-center gap-3 rounded-lg border bg-background px-3 text-sm transition-colors hover:border-primary/40"><input type="checkbox" checked={options.isOriginal} onChange={(event) => setOptions((current) => ({ ...current, isOriginal: event.target.checked }))} className="h-4 w-4 rounded border-input accent-primary" /><span className="flex-1"><span className="flex items-center gap-1.5 font-medium"><BadgeCheck className="h-4 w-4 text-primary" />声明为原创</span><span className="mt-0.5 block text-xs text-muted-foreground">按原创笔记参数提交</span></span></label></CardContent></Card>
}

function PublishPageContent({ initialDraft }: { initialDraft: Partial<PublishDraft> }) {
  const [reports, setReports] = useState<Array<{id:string;title:string;summary:string;industryId:string;industryName:string;createdAt:string;data:any}>>([])
  const [selectedReportId,setSelectedReportId] = useState('')
  const [industries, setIndustries] = useState<Industry[]>([])
  const [selectedDomain, setSelectedDomain] = useState(initialDraft.selectedDomain || '')
  const [loadingIndustries, setLoadingIndustries] = useState(true)
  const [industriesError, setIndustriesError] = useState<string | null>(null)
  const [selectedModules, setSelectedModules] = useState<AIAnalysisModuleId[]>(Array.isArray(initialDraft.selectedModules) ? initialDraft.selectedModules : AI_ANALYSIS_MODULES.map((module) => module.id))
  const [accounts, setAccounts] = useState<PublishAccount[]>([])
  const [accountId, setAccountId] = useState('')
  const [accountsLoading, setAccountsLoading] = useState(true)
  const [accountDialogOpen, setAccountDialogOpen] = useState(false)
  const [accountView, setAccountView] = useState<AccountView>('connected')
  const [title, setTitle] = useState(initialDraft.title || '')
  const [summary, setSummary] = useState(initialDraft.summary || '选择综合分析报告后，加载其已完成的社媒文案。')
  const [publishOptions, setPublishOptions] = useState<PublishOptions>({ visibility: '仅自己可见', scheduleAt: '', isOriginal: true, relatedTopics: '' })
  const [slides, setSlides] = useState<ReportSlide[]>(Array.isArray(initialDraft.slides) ? initialDraft.slides : [])
  const [coverImageDataUrl, setCoverImageDataUrl] = useState(initialDraft.coverImageDataUrl || '')
  const [currentSlide, setCurrentSlide] = useState(typeof initialDraft.currentSlide === 'number' ? Math.max(0, initialDraft.currentSlide) : 0)
  const [captureSlide, setCaptureSlide] = useState<ReportSlide | null>(null)
  const [captureMode, setCaptureMode] = useState<'cover' | 'report' | null>(null)
  void setCaptureSlide
  void setCaptureMode
  const [status, setStatus] = useState<ModuleStatus>('ready')
  const [progressIndex, setProgressIndex] = useState(-1)
  const [published, setPublished] = useState(false)
  const [previewDialogOpen, setPreviewDialogOpen] = useState(false)
  const [publishing, setPublishing] = useState(false)
  const [publishStage, setPublishStage] = useState<PublishStage>('idle')
  const draftRestored = true
  const [error, setError] = useState<string | null>(null)
  const [mcpLogin, setMcpLogin] = useState<boolean | null>(null)
  const [mcpError, setMcpError] = useState<string | null>(null)
  const [loginQr, setLoginQr] = useState<string | null>(null)
  const [qrLoading, setQrLoading] = useState(false)
  const captureRef = useRef<HTMLDivElement>(null)
  const checkLoginRef = useRef<() => Promise<boolean>>(async () => false)

  const domain = industries.find((item) => item.id === selectedDomain)
  const chapterCount = (reports.find(report => report.id === selectedReportId)?.data?.socialReport?.sections?.length || 0) + 1
  const selectedAccount = accounts.find((account) => account.id === accountId)
  const selectedItems = useMemo(() => AI_ANALYSIS_MODULES.filter((module) => selectedModules.includes(module.id)), [selectedModules])
  const previewItems = useMemo<PreviewItem[]>(() => [
    ...(coverImageDataUrl ? [{ id: 'cover', title: '封面图', imageDataUrl: coverImageDataUrl, kind: 'cover' as const }] : []),
    ...slides.map((slide, index) => ({ id: slide.moduleId + '-' + index, title: slide.title, imageDataUrl: slide.imageDataUrl, kind: 'report' as const, moduleId: slide.moduleId })),
  ], [coverImageDataUrl, slides])
  const activeSlideIndex = previewItems.length ? Math.min(currentSlide, previewItems.length - 1) : 0
  const activePreview = previewItems[activeSlideIndex]
  const hasPreview = Boolean(selectedReportId) && previewItems.length > 1 && previewItems.every((item) => item.imageDataUrl) && Boolean(summary.trim())

  useEffect(() => {
    const draft: PublishDraft = { selectedDomain, selectedModules, title, summary, slides, coverImageDataUrl, currentSlide }
    try {
      window.localStorage.setItem(PUBLISH_DRAFT_STORAGE_KEY, JSON.stringify(draft))
    } catch {
      // Image data may exceed browser storage limits; the current page remains usable.
    }
  }, [draftRestored, selectedDomain, selectedModules, title, summary, slides, coverImageDataUrl, currentSlide])

  const loadAccounts = useCallback(async () => {
    setAccountsLoading(true)
    try {
      const response = await fetch('/api/publish/accounts', { cache: 'no-store' })
      const payload = await response.json().catch(() => ({}))
      if (!response.ok || payload.success === false) throw new Error(payload.error || '账号加载失败')
      const configured = (Array.isArray(payload.accounts) ? payload.accounts : []).filter((account: PublishAccount) => account.enabled && account.isConfigured)
      setAccounts(configured)
      setAccountId((current) => configured.some((account: PublishAccount) => account.id === current) ? current : configured[0]?.id || '')
    } catch (loadError) {
      setAccounts([])
      setAccountId('')
      setIndustriesError(loadError instanceof Error ? loadError.message : '账号加载失败')
    } finally { setAccountsLoading(false) }
  }, [])

  const checkMcpLogin = useCallback(async () => {
    try {
      const response = await fetch('/api/publish/xhs/status', { cache: 'no-store' })
      const payload = await response.json().catch(() => ({}))
      if (!response.ok || payload.success === false) throw new Error(payload.error || 'MCP 服务不可用')
      const data = payload.data || {}
      const loggedIn = Boolean(data.logged_in ?? data.loggedIn ?? data.is_logged_in ?? data.isLoggedIn)
      setMcpLogin(loggedIn)
      if (!loggedIn) return false
      const username = typeof data.username === 'string' && data.username.trim() ? data.username.trim() : '小红书个人账号'
      const accountKey = typeof data.user_id === 'string' && data.user_id.trim() ? data.user_id.trim() : username
      const accountResponse = await fetch('/api/publish/accounts', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ displayName: username, accountId: accountKey, verified: true }),
      })
      const accountPayload = await accountResponse.json().catch(() => ({}))
      if (!accountResponse.ok || accountPayload.success === false) throw new Error(accountPayload.error || '登录成功，但账号记录保存失败')
      const saved = accountPayload.account as PublishAccount | undefined
      if (saved) {
        setAccounts((current) => [saved, ...current.filter((account) => account.id !== saved.id)])
        setAccountId(saved.id)
      }
      setAccountView('connected')
      setAccountDialogOpen(false)
      setLoginQr(null)
      return true
    } catch (loginError) {
      setMcpLogin(false)
      setMcpError(loginError instanceof Error ? loginError.message : 'MCP 服务不可用')
      return false
    }
  }, [])

  useEffect(() => { checkLoginRef.current = checkMcpLogin }, [checkMcpLogin])
  useEffect(() => {
    if (!accountDialogOpen || accountView !== 'new' || !loginQr) return
    const timer = window.setInterval(() => { void checkLoginRef.current() }, 2000)
    return () => window.clearInterval(timer)
  }, [accountDialogOpen, accountView, loginQr])

  const openNewAccount = async () => {
    setAccountView('new')
    setLoginQr(null)
    setMcpError(null)
    setMcpLogin(null)
    setQrLoading(true)
    try {
      const response = await fetch('/api/publish/xhs/qrcode', { cache: 'no-store' })
      const payload = await response.json().catch(() => ({}))
      if (!response.ok || payload.success === false) throw new Error(payload.error || '获取登录二维码失败')
      const data = payload.data || {}
      const alreadyLoggedIn = Boolean(data.logged_in ?? data.loggedIn ?? data.is_logged_in ?? data.isLoggedIn)
      if (alreadyLoggedIn) { await checkMcpLogin(); return }
      if (typeof data.imageDataUrl !== 'string' || !data.imageDataUrl) throw new Error('MCP 未返回可显示的二维码，请确认 MCP 服务已启动')
      setLoginQr(data.imageDataUrl)
    } catch (qrError) {
      setMcpError(qrError instanceof Error ? qrError.message : '获取登录二维码失败')
    } finally { setQrLoading(false) }
  }

  useEffect(() => {
    let cancelled = false
    async function loadIndustries() {
      try {
        const response = await fetch('/api/analysis/reports?type=comprehensive&limit=100')
        const payload = await response.json().catch(() => ({}))
        if (!response.ok || payload.success === false || !Array.isArray(payload.reports)) throw new Error(payload.error || payload.message || '产业领域加载失败')
        if (!cancelled) {
          const items = payload.reports.filter((row: any) => row.data?.socialReport && row.data?.metadata?.runId)
          setReports(items)
          setIndustries(items.map((row: any) => ({id:row.industryId,name:row.industryName})))
          const queryId = new URLSearchParams(window.location.search).get('reportId')
          const selected = items.find((row: any) => row.id === queryId) || items[0]
          setSelectedReportId(selected?.id || ''); setSelectedDomain(selected?.industryId || '')
          setSlides([]); setCoverImageDataUrl('')
        }
      } catch (loadError) { if (!cancelled) setIndustriesError(loadError instanceof Error ? loadError.message : '产业领域加载失败') }
      finally { if (!cancelled) setLoadingIndustries(false) }
    }
    void loadIndustries()
    const timer = window.setTimeout(() => { void loadAccounts() }, 0)
    return () => { cancelled = true; window.clearTimeout(timer) }
  }, [loadAccounts])

  const captureReportImage = async (slide: ReportSlide) => {
    return renderPreviewImage({ kind: 'report', domainName: domain?.name || '投资研究', title: slide.title, content: slide.content, moduleCount: chapterCount })
  }

  const captureCoverImage = async (coverTitle: string, coverSummary: string) => {
    return renderPreviewImage({ kind: 'cover', domainName: domain?.name || '投资研究', title: coverTitle, content: coverSummary, moduleCount: chapterCount })
  }

  const generateContent = async () => {
    const report = reports.find(row => row.id === selectedReportId)
    if (!report || status === 'running') return
    setStatus('running'); setError(null); setSlides([]); setCoverImageDataUrl('')
    try {
      const social = report.data.socialReport
      const sections = [...social.sections, { title: '风险与边界', body: social.risks.join('\n') + '\n仅供研究交流，不构成投资建议。' }]
      const generatedSlides: ReportSlide[] = []
      for (const [index, section] of sections.entries()) {
        setProgressIndex(index)
        const slide: ReportSlide = { moduleId: 'comprehensive', title: section.title, content: section.body, imageDataUrl: '' }
        slide.imageDataUrl = await captureReportImage(slide); generatedSlides.push(slide)
      }
      const copy = social.subtitle + '\n\n' + social.takeaways.join('\n') + '\n\n风险：' + social.risks.join('；') + '\n仅供研究交流，不构成投资建议。'
      setTitle(social.title); setSummary(copy.slice(0,1000))
      setCoverImageDataUrl(await captureCoverImage(social.title,social.subtitle))
      setSlides(generatedSlides); setCurrentSlide(0); setStatus('done'); setPublished(false)
    } catch (reason) { setStatus('ready'); setError(reason instanceof Error ? reason.message : '报告排版失败') }
  }

  const publishNow = async () => {
    if (!selectedAccount || !hasPreview || status === 'running') return
    setError(null); setPublished(false)
    setPublishStage('checking')
    const loggedIn = await checkMcpLogin()
    if (!loggedIn) {
      setPublishStage('idle')
      setAccountDialogOpen(true)
      await openNewAccount()
      return
    }
    setPublishing(true); setPublishStage('publishing')
    try {
      const response = await fetch('/api/publish/xhs', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          reportId: selectedReportId,
          accountId: selectedAccount.id,
          title: title || `${domain?.name || '行业'}投资观察`,
          content: stripMarkdown(summary),
          imageDataUrls: previewItems.map((item) => item.imageDataUrl),
          tags: Array.from(new Set([
            ...selectedAccount.defaultTopics,
            domain?.name || '',
            ...publishOptions.relatedTopics.split(/[,，#\s]+/),
          ].map((tag) => tag.trim().replace(/^#/, '')).filter(Boolean))).slice(0, 10),
          visibility: publishOptions.visibility,
          scheduleAt: publishOptions.scheduleAt ? new Date(publishOptions.scheduleAt).toISOString() : '',
          isOriginal: publishOptions.isOriginal,
        }),
      })
      const payload = await response.json().catch(() => ({}))
      if (!response.ok || payload.success === false) throw new Error(payload.error || '小红书发布失败')
      setPublished(true); setPublishStage('success')
    } catch (publishFailure) {
      const message = publishFailure instanceof Error ? publishFailure.message : '发布失败'
      setError(message); setPublishStage('failure')
    }
    finally { setPublishing(false) }
  }

  const publishStatusContent = publishStage === 'checking'
    ? { title: '正在检查发布状态', description: '正在确认小红书登录状态，请稍候。' }
    : publishStage === 'publishing'
      ? { title: '正在发布笔记', description: '正在打包标题、正文和图片并提交至小红书，请不要关闭页面。' }
      : publishStage === 'success'
        ? { title: '发布成功', description: `笔记已成功提交至小红书${selectedAccount ? `（${selectedAccount.displayName}）` : ''}。` }
        : { title: '发布失败', description: error || '小红书发布失败，请检查登录状态和 MCP 服务后重试。' }

  const scheduleMin = ''
  return <div className="min-h-full space-y-6 pb-10"><Dialog open={previewDialogOpen} onOpenChange={setPreviewDialogOpen}><DialogContent className="flex max-h-[92vh] flex-col overflow-hidden sm:max-w-5xl"><DialogHeader className="pr-8"><DialogTitle>{activePreview?.title || '图文预览'}</DialogTitle><DialogDescription>高分辨率发布图，正文可滚动查看；不会触发发布。</DialogDescription></DialogHeader><div className="min-h-0 overflow-y-auto">{activePreview?.imageDataUrl && <img src={activePreview.imageDataUrl} alt={activePreview.title} className="h-auto w-full" />}</div></DialogContent></Dialog>
    <header className="flex flex-col gap-5 border-b pb-6 lg:flex-row lg:items-end lg:justify-between">
      <div><div className="mb-3 flex items-center gap-2 text-sm text-muted-foreground"><span>工作台</span><ChevronRight className="h-4 w-4" /><span className="text-foreground">数据发布</span></div><div className="flex items-center gap-3"><div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-primary/10 text-primary"><Send className="h-5 w-5" /></div><div><h1 className="text-3xl font-semibold tracking-tight">数据发布</h1><p className="mt-1 text-sm text-muted-foreground">从综合分析成品报告制作图文，预览确认后再发布。</p></div></div></div>
      <div className="flex flex-wrap items-center gap-3"><PublishScheduleDialog industries={industries} accounts={accounts} />{selectedAccount && <div className="hidden items-center gap-2 rounded-full border bg-muted/30 px-3 py-2 text-sm sm:flex"><span className="h-2 w-2 rounded-full bg-emerald-500" /><span className="max-w-28 truncate font-medium">{selectedAccount.displayName}</span></div>}<Button variant="outline" className="gap-2" onClick={() => { setAccountView('connected'); setAccountDialogOpen(true) }}><Settings2 className="h-4 w-4" />发布设置</Button></div>
    </header>
    {industriesError && <div className="flex items-start gap-2 rounded-xl border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive"><AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />{industriesError}</div>}
    <div className="grid items-stretch gap-6 xl:grid-cols-[minmax(0,0.9fr)_minmax(0,1.6fr)]">
      <Card className="h-full overflow-hidden"><CardHeader><CardTitle>选择综合分析报告</CardTitle><CardDescription>仅使用综合分析流程已完成的社媒版报告，不重新采集或调用AI。个人持仓分析不进入发布。</CardDescription></CardHeader><CardContent className="space-y-3">{loadingIndustries ? <p>加载报告中…</p> : reports.length ? reports.map(report => <button key={report.id} onClick={() => { setSelectedReportId(report.id); setSelectedDomain(report.industryId); setSlides([]); setCoverImageDataUrl(''); setStatus('ready') }} className={cn('block w-full rounded-xl border p-4 text-left transition-colors',selectedReportId === report.id && 'border-primary bg-primary/5')}><p className="font-semibold">{report.title}</p><p className="mt-2 text-xs text-muted-foreground">{report.industryName} · {new Date(report.createdAt).toLocaleString('zh-CN')}</p><p className="mt-2 line-clamp-3 text-sm text-muted-foreground">{report.summary}</p></button>) : <div className="rounded-xl border border-dashed p-6 text-sm"><p>暂无完成的社媒版报告。</p><a href="/comprehensive-analysis" className="mt-3 inline-block text-primary underline">前往综合分析生成</a></div>}</CardContent></Card>


      <div className="grid h-full min-h-0 items-stretch gap-6 md:grid-cols-2">
      <Card className="flex h-full min-h-0 flex-col overflow-hidden"><CardHeader className="shrink-0 border-b bg-muted/10 pb-4"><div><CardTitle className="flex items-center gap-2 text-lg"><FileImage className="h-5 w-5 text-primary" />图文预览</CardTitle><CardDescription className="mt-1">封面 + 每个报告章节各一张图片，预览区域可上下滚动查看长图。</CardDescription></div></CardHeader><CardContent className="flex min-h-0 flex-1 flex-col gap-4 pt-5"><div className="min-h-[430px] min-w-0 flex-1 overflow-y-auto overscroll-contain rounded-2xl border border-slate-700 bg-[#0b1220] shadow-lg" aria-label="图文预览滚动区域">{activePreview?.imageDataUrl ? <button type="button" className="block w-full cursor-zoom-in" aria-label="放大当前图文预览" onClick={() => setPreviewDialogOpen(true)}><img src={activePreview.imageDataUrl} alt={`${activePreview.title}预览图`} className="block h-auto w-full object-contain" /></button> : <div className="flex h-full min-h-[430px] flex-col items-center justify-center px-8 text-center text-slate-400"><FileImage className="h-10 w-10 opacity-50" /><p className="mt-4 font-medium text-slate-200">尚未生成预览图</p><p className="mt-2 text-xs leading-5">点击下方“生成图文内容”，系统会生成封面和各模块图片。</p></div>}</div>{previewItems.length > 0 && <div className="flex shrink-0 items-center justify-between gap-3"><Button variant="outline" size="sm" className="gap-1" disabled={activeSlideIndex === 0} onClick={() => setCurrentSlide((index) => Math.max(0, index - 1))}><ChevronLeft className="h-4 w-4" />上一张</Button><div className="flex max-w-[60%] items-center gap-1.5 overflow-x-auto">{previewItems.map((item, index) => <button key={item.id} aria-label={`查看${item.title}`} onClick={() => setCurrentSlide(index)} className={cn('h-2.5 w-2.5 shrink-0 rounded-full transition-colors', index === activeSlideIndex ? 'bg-primary' : 'bg-muted-foreground/30')} />)}</div><Button variant="outline" size="sm" className="gap-1" disabled={activeSlideIndex === previewItems.length - 1} onClick={() => setCurrentSlide((index) => Math.min(previewItems.length - 1, index + 1))}>下一张<ChevronRight className="h-4 w-4" /></Button></div>}{status === 'running' && <div className="shrink-0 rounded-xl border border-primary/20 bg-primary/5 px-4 py-3 text-sm"><div className="flex items-center gap-2 font-medium"><Loader2 className="h-4 w-4 animate-spin text-primary" />正在生成第 {Math.min(progressIndex + 1, chapterCount)} / {chapterCount} 个章节</div><div className="mt-3 h-1.5 overflow-hidden rounded-full bg-primary/10"><div className="h-full rounded-full bg-primary transition-all duration-300" style={{ width: `${chapterCount ? Math.max(8, ((progressIndex + 1) / chapterCount) * 100) : 0}%` }} /></div></div>}<Button className="h-11 w-full shrink-0 gap-2" onClick={generateContent} disabled={!selectedReportId || status === 'running'}><RefreshCw className={cn('h-4 w-4', status === 'running' && 'animate-spin')} />{status === 'running' ? '生成中…' : '生成图文内容'}</Button>{error && <div className="shrink-0 flex items-start gap-2 rounded-xl border border-destructive/30 bg-destructive/5 px-3 py-2.5 text-sm text-destructive"><AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />{error}</div>}</CardContent></Card>
      <div className="flex min-h-0 flex-col gap-6"><Card className="flex min-h-0 flex-1 flex-col overflow-hidden"><CardHeader className="shrink-0 border-b bg-muted/10 pb-4"><CardTitle className="flex items-center gap-2 text-lg"><FileText className="h-5 w-5 text-primary" />发布文案</CardTitle><CardDescription className="mt-1">文案来自所选综合分析报告，可在发布前人工校对。</CardDescription></CardHeader><CardContent className="flex min-h-0 flex-1 flex-col gap-4 pt-5"><div className="space-y-2"><div className="flex items-center justify-between"><Label htmlFor="publish-title">标题</Label><span className={cn('text-xs', title.length > 20 ? 'text-destructive' : 'text-muted-foreground')}>{title.length} / 20</span></div><input id="publish-title" maxLength={20} value={title} onChange={(event) => { setTitle(event.target.value); setPublished(false) }} placeholder="选择报告后填充标题" className="h-11 w-full rounded-lg border bg-background px-3 text-sm outline-none transition-colors focus:border-primary focus:ring-2 focus:ring-primary/20" /></div><div className="flex min-h-0 flex-1 flex-col gap-2"><div className="flex items-center justify-between"><Label htmlFor="publish-copy">正文</Label><span className={cn('text-xs', summary.length > 1000 ? 'text-destructive' : 'text-muted-foreground')}>{summary.length} / 1000</span></div><Textarea id="publish-copy" maxLength={1000} value={summary} onChange={(event) => { setSummary(event.target.value); setPublished(false) }} className="min-h-[260px] flex-1 resize-none leading-6" /></div>{published && <div className="flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2.5 text-sm text-emerald-700"><CheckCircle2 className="h-4 w-4" />已提交发布至小红书：{selectedAccount?.displayName}{publishOptions.scheduleAt && '（已设定定时）'}</div>}<Button className="h-11 w-full gap-2" onClick={publishNow} disabled={!hasPreview || !selectedAccount || status === 'running' || publishing}><Send className={cn('h-4 w-4', publishing && 'animate-pulse')} />{publishing ? '发布中…' : publishOptions.scheduleAt ? '定时发布' : '一键发布'}</Button>{!selectedAccount && <p className="flex items-start gap-2 text-xs leading-5 text-muted-foreground"><Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />请先点击右上角“发布设置”选择或新增账号。</p>}</CardContent></Card><PublishOptionsCard options={publishOptions} setOptions={setPublishOptions} domainName={domain?.name} defaultTopics={selectedAccount?.defaultTopics || []} scheduleMin={scheduleMin} /></div>
      </div>
    </div>

    <div ref={captureRef} className="pointer-events-none fixed -left-[10000px] top-0 w-[720px] overflow-hidden rounded-2xl bg-[#0b1220] text-white" aria-hidden="true">{captureMode === 'cover' ? <div className="relative overflow-hidden bg-gradient-to-br from-slate-950 via-blue-950 to-teal-800 px-10 pb-10 pt-12"><div className="absolute -right-24 -top-24 h-72 w-72 rounded-full border-[28px] border-cyan-300/10" /><div className="absolute -bottom-32 -left-16 h-72 w-72 rounded-full bg-cyan-300/10 blur-2xl" /><div className="relative"><div className="flex items-center justify-between"><p className="text-sm font-medium uppercase tracking-[0.28em] text-cyan-300">AI INVESTMENT BRIEF</p><span className="rounded-full border border-cyan-200/30 bg-cyan-200/10 px-3 py-1 text-xs text-cyan-100">小红书研究笔记</span></div><h2 className="mt-8 text-6xl font-semibold leading-tight text-white">{domain?.name || '投资研究'}<br /><span className="text-cyan-200">产业观察</span></h2><p className="mt-8 max-w-xl text-2xl leading-relaxed text-slate-200">从市场趋势到产业链变化，快速读懂本期 AI 投资信号。</p><div className="mt-14 grid grid-cols-3 gap-4 border-t border-white/15 pt-6 text-center"><div><p className="text-3xl font-semibold text-white">{chapterCount}</p><p className="mt-1 text-sm text-slate-300">分析模块</p></div><div><p className="text-3xl font-semibold text-emerald-300">AI</p><p className="mt-1 text-sm text-slate-300">研究引擎</p></div></div><p className="mt-8 text-sm tracking-wide text-slate-400">数据研究 · 风险提示 · 仅供交流</p></div></div> : captureSlide ? <><div className="border-b border-white/10 bg-gradient-to-br from-slate-900 via-slate-800 to-primary/40 px-8 pb-8 pt-7"><p className="text-xs font-medium uppercase tracking-[0.22em] text-cyan-300">AI INVESTMENT BRIEF</p><h2 className="mt-4 text-4xl font-semibold leading-tight">{domain?.name || '投资研究'}<br /><span className="text-slate-300">{captureSlide.title}</span></h2></div><div className="space-y-5 px-8 py-8"><p className="text-sm font-medium text-cyan-300">分析报告摘要</p><p className="whitespace-pre-wrap text-lg leading-8 text-slate-200">{captureSlide.content}</p><div className="grid grid-cols-2 gap-3 border-t border-white/10 pt-5 text-center"><div><p className="text-2xl font-semibold">{chapterCount}</p><p className="text-xs text-slate-400">分析模块</p></div><div><p className="text-2xl font-semibold text-emerald-400">AI</p><p className="text-xs text-slate-400">研究引擎</p></div></div></div></> : null}</div>

    <Dialog open={publishStage !== 'idle'} onOpenChange={(open) => { if (!open && !publishing) setPublishStage('idle') }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {publishStage === 'success' ? <CheckCircle2 className="h-5 w-5 text-emerald-600" /> : publishStage === 'failure' ? <AlertCircle className="h-5 w-5 text-destructive" /> : <Loader2 className="h-5 w-5 animate-spin text-primary" />}
            {publishStatusContent.title}
          </DialogTitle>
          <DialogDescription>{publishStatusContent.description}</DialogDescription>
        </DialogHeader>
        <div className={cn('rounded-xl border px-4 py-3 text-sm', publishStage === 'success' ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : publishStage === 'failure' ? 'border-destructive/30 bg-destructive/5 text-destructive' : 'border-primary/20 bg-primary/5 text-primary')}>
          {publishStage === 'checking' && '步骤 1/2：检查账号登录状态'}
          {publishStage === 'publishing' && '步骤 2/2：正在上传并发布图文内容'}
          {publishStage === 'success' && '发布流程已完成，可以关闭此窗口。'}
          {publishStage === 'failure' && '发布流程未完成，请根据错误信息处理后再次尝试。'}
        </div>
        {publishStage === 'failure' && error && <div className="max-h-36 overflow-y-auto rounded-xl border border-destructive/20 bg-background px-4 py-3 text-sm leading-6 text-destructive" role="alert">实际错误：{error}</div>}
        {publishStage !== 'checking' && publishStage !== 'publishing' && <DialogFooter><Button onClick={() => setPublishStage('idle')}>关闭</Button></DialogFooter>}
      </DialogContent>
    </Dialog>

    <AccountSettingsDialog open={accountDialogOpen} onOpenChange={setAccountDialogOpen} view={accountView} onViewChange={setAccountView} accounts={accounts} selectedId={accountId} onSelect={setAccountId} onNew={openNewAccount} loading={accountsLoading} qr={loginQr} qrLoading={qrLoading} mcpLogin={mcpLogin} error={mcpError} onRefreshQr={openNewAccount} onRefreshAccounts={loadAccounts} />
  </div>
}

export default function PublishPage() {
  const initialDraft = useSyncExternalStore(subscribeToPublishDraft, getPublishDraftSnapshot, () => EMPTY_PUBLISH_DRAFT)
  const draftKey = Object.keys(initialDraft).length ? 'restored' : 'empty'
  return <PublishPageContent key={draftKey} initialDraft={initialDraft} />
}

function AccountSettingsDialog({ open, onOpenChange, view, onViewChange, accounts, selectedId, onSelect, onNew, loading, qr, qrLoading, mcpLogin, error, onRefreshQr, onRefreshAccounts }: { open: boolean; onOpenChange: (open: boolean) => void; view: AccountView; onViewChange: (view: AccountView) => void; accounts: PublishAccount[]; selectedId: string; onSelect: (id: string) => void; onNew: () => void; loading: boolean; qr: string | null; qrLoading: boolean; mcpLogin: boolean | null; error: string | null; onRefreshQr: () => void; onRefreshAccounts: () => Promise<void> }) {
  return <Dialog open={open} onOpenChange={onOpenChange}><DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-xl"><DialogHeader><DialogTitle className="flex items-center gap-2"><Users className="h-5 w-5 text-primary" />发布设置</DialogTitle><DialogDescription>选择已有账号，或通过 MCP 扫码新增小红书账号。</DialogDescription></DialogHeader><div className="flex rounded-lg border bg-muted/30 p-1"><button className={cn('flex-1 rounded-md px-3 py-2 text-sm font-medium transition-colors', view === 'connected' ? 'bg-background shadow-sm' : 'text-muted-foreground hover:text-foreground')} onClick={() => onViewChange('connected')}>已有账号</button><button className={cn('flex-1 rounded-md px-3 py-2 text-sm font-medium transition-colors', view === 'new' ? 'bg-background shadow-sm' : 'text-muted-foreground hover:text-foreground')} onClick={onNew}>新增账号</button></div>{view === 'connected' ? <div className="space-y-4"><div className="flex items-center justify-between"><div><p className="text-sm font-medium">已连接账号</p><p className="text-xs text-muted-foreground">只显示名称，不展示内部编码。</p></div><Button variant="ghost" size="sm" className="gap-1.5" onClick={onRefreshAccounts}><RefreshCw className="h-3.5 w-3.5" />刷新</Button></div>{loading ? <div className="rounded-xl border border-dashed px-4 py-10 text-center text-sm text-muted-foreground"><Loader2 className="mx-auto mb-2 h-5 w-5 animate-spin" />正在读取账号</div> : accounts.length ? <div className="space-y-2">{accounts.map((account) => <button key={account.id} onClick={() => onSelect(account.id)} className={cn('flex w-full items-center gap-3 rounded-xl border p-3 text-left transition-colors hover:border-primary/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary', selectedId === account.id ? 'border-primary bg-primary/5' : 'bg-card')}><span className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10 text-primary"><UserRound className="h-5 w-5" /></span><span className="min-w-0 flex-1"><span className="block truncate font-medium">{account.displayName}</span><span className="mt-0.5 block text-xs text-muted-foreground">小红书个人账号 · 已连接</span></span>{selectedId === account.id && <span className="h-2.5 w-2.5 rounded-full bg-primary" aria-label="当前账号" />}</button>)}</div> : <div className="rounded-xl border border-dashed px-4 py-8 text-center"><UserRound className="mx-auto h-8 w-8 text-muted-foreground/50" /><p className="mt-3 text-sm font-medium">还没有已连接账号</p><p className="mt-1 text-xs text-muted-foreground">新增账号后，用手机扫码即可完成登录。</p></div>}<Button className="w-full gap-2" onClick={onNew}><Plus className="h-4 w-4" />新增账号</Button></div> : <div className="space-y-5"><div className="rounded-xl border border-primary/20 bg-primary/5 p-4"><div className="flex items-start gap-3"><Info className="mt-0.5 h-4 w-4 shrink-0 text-primary" /><div><p className="text-sm font-medium">使用小红书 App 扫码登录</p><p className="mt-1 text-xs leading-5 text-muted-foreground">二维码会直接显示在这里。扫码成功后，MCP 会自动读取账号名称并保存。</p></div></div></div><div className="flex min-h-72 items-center justify-center rounded-2xl border bg-white p-5">{qrLoading ? <div className="text-center text-sm text-slate-500"><Loader2 className="mx-auto mb-3 h-6 w-6 animate-spin" />正在获取二维码</div> : qr ? <div className="text-center"><img src={qr} alt="小红书 MCP 登录二维码" className="mx-auto h-56 w-56 rounded-lg object-contain" /><p className="mt-3 text-xs text-slate-500">二维码每 2 秒自动检查登录状态</p></div> : <div className="max-w-xs text-center"><AlertCircle className="mx-auto mb-3 h-7 w-7 text-amber-500" /><p className="text-sm text-slate-600">{error || '暂时无法获取二维码'}</p><Button variant="outline" size="sm" className="mt-3 gap-1.5" onClick={onRefreshQr}><RefreshCw className="h-3.5 w-3.5" />重新获取</Button></div>}</div>{mcpLogin === true && <div className="flex items-center gap-2 rounded-lg bg-emerald-50 px-3 py-2.5 text-sm text-emerald-700"><CheckCircle2 className="h-4 w-4" />登录成功，正在保存账号</div>}<DialogFooter><Button variant="outline" onClick={() => onViewChange('connected')}>返回已有账号</Button></DialogFooter></div>}</DialogContent></Dialog>
}
