'use client'

import { useMemo, useState } from 'react'
import {
  ArrowDown,
  ArrowRight,
  BarChart3,
  Building2,
  CheckCircle2,
  ChevronRight,
  CircleDot,
  ExternalLink,
  FileCheck2,
  Layers3,
  Link2,
  Loader2,
  Network,
  Search,
  ShieldCheck,
  TrendingDown,
  TrendingUp,
  Users,
} from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Progress } from '@/components/ui/progress'
import { ScrollArea } from '@/components/ui/scroll-area'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { cn } from '@/lib/utils'
import { NodeETFIndexDisplay } from './NodeETFIndexDisplay'
import type {
  Company,
  Segment,
  SegmentRelation,
  Stage,
  SwimLaneData,
} from '@/types/industry-graph'

interface MatchDetail {
  nodeId: string
  nodeName: string
  etfCount: number
  indexCount: number
  success: boolean
  etfs?: Segment['matchedEtfs']
  indices?: Segment['matchedIndices']
}

interface IndustryGraphWorkspaceProps {
  data: SwimLaneData
  matchResults?: Record<string, MatchDetail>
  onCompanyClick?: (companyId: string) => void
}

interface SegmentContext {
  segment: Segment
  stage: Stage
}

interface CompanyContext {
  company: Company
  segment: Segment
  stage: Stage
}

interface CompanyInvestmentContext {
  company: {
    matchSource: string
    matchConfidence: number
    representativenessScore: number
    selectionReason?: string
    valueSignals?: Record<string, number>
  }
  representativeEtfs: Array<{
    code: string
    name: string
    relevance: number
    reasoning: string
    holdingWeight: number | null
    reportPeriod?: string | null
    source?: string
    holdingVerified: boolean
  }>
  representativeIndices: Array<{
    code: string
    name: string
    relevance: number
    reasoning: string
    source: string
  }>
  peerCompanies: Array<{
    id: string
    name: string
    ticker?: string
    marketPosition?: string
    representativenessScore?: number
  }>
  evidence: {
    level: 'holding_verified' | 'semantic_only'
    verifiedEtfCount: number
    semanticEtfCount: number
    graphRevisionId?: string
  }
}

const RELATION_LABELS: Record<SegmentRelation['type'], string> = {
  SUPPLIES: '供应',
  INFLUENCES: '影响',
  CONSTRAINS: '制约',
  SUBSTITUTES: '替代',
}

const DIRECTION_LABELS: Record<SegmentRelation['direction'], string> = {
  positive: '正向',
  negative: '负向',
  mixed: '混合',
}

const POSITION_LABELS: Record<Company['marketPosition'], string> = {
  leader: '龙头',
  major: '主力',
  emerging: '新兴',
}

function relationTone(direction: SegmentRelation['direction']) {
  if (direction === 'positive') return 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900/70 dark:bg-emerald-950/40 dark:text-emerald-300'
  if (direction === 'negative') return 'border-red-200 bg-red-50 text-red-700 dark:border-red-900/70 dark:bg-red-950/40 dark:text-red-300'
  return 'border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-900/70 dark:bg-amber-950/40 dark:text-amber-300'
}

function searchableText(context: SegmentContext) {
  const { stage, segment } = context
  return [
    stage.name,
    stage.code,
    segment.name,
    segment.code,
    segment.description,
    ...(segment.keyCategories || []),
    ...segment.companies.flatMap(company => [company.name, company.nameEn, company.ticker, ...(company.keyProducts || [])]),
    ...(segment.matchedEtfs || []).flatMap(etf => [etf.name, etf.code]),
    ...(segment.matchedIndices || []).flatMap(index => [index.name, index.code]),
  ].filter(Boolean).join(' ').toLocaleLowerCase('zh-CN')
}

function isSafeEvidenceUrl(value: string) {
  try {
    const url = new URL(value)
    return url.protocol === 'https:' || url.protocol === 'http:'
  } catch {
    return false
  }
}

function MetricCard({
  icon: Icon,
  label,
  value,
  detail,
}: {
  icon: typeof Layers3
  label: string
  value: number | string
  detail: string
}) {
  return (
    <div className="rounded-xl border bg-card p-3.5 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-medium text-muted-foreground">{label}</p>
          <p className="mt-1 font-mono text-2xl font-semibold tracking-tight tabular-nums">{value}</p>
          <p className="mt-1 text-xs text-muted-foreground">{detail}</p>
        </div>
        <div className="rounded-lg bg-primary/10 p-2 text-primary">
          <Icon className="size-4" aria-hidden="true" />
        </div>
      </div>
    </div>
  )
}

function MappingBadge({ code, name, relevance }: { code: string; name: string; relevance: number }) {
  return (
    <div className="flex min-w-0 items-center gap-2 rounded-lg border bg-background px-2.5 py-2">
      <Badge variant="secondary" className="shrink-0 font-mono text-[11px]">{code}</Badge>
      <span className="min-w-0 flex-1 truncate text-xs font-medium">{name}</span>
      <span className="shrink-0 font-mono text-[11px] text-muted-foreground tabular-nums">
        {Math.round(relevance * 100)}%
      </span>
    </div>
  )
}

export function IndustryGraphWorkspace({
  data,
  matchResults = {},
  onCompanyClick,
}: IndustryGraphWorkspaceProps) {
  const sortedStages = useMemo(
    () => [...data.stages]
      .sort((a, b) => a.order - b.order)
      .map(stage => ({
        ...stage,
        segments: [...stage.segments].sort((a, b) => (a.order ?? 0) - (b.order ?? 0)),
      })),
    [data.stages]
  )

  const allSegments = useMemo<SegmentContext[]>(
    () => sortedStages.flatMap(stage => stage.segments.map(segment => ({ stage, segment }))),
    [sortedStages]
  )

  const hydratedSegments = useMemo<SegmentContext[]>(
    () => allSegments.map(context => {
      const match = matchResults[context.segment.id]
      if (!match) return context
      return {
        ...context,
        segment: {
          ...context.segment,
          matchedEtfs: context.segment.matchedEtfs?.length ? context.segment.matchedEtfs : match.etfs,
          matchedIndices: context.segment.matchedIndices?.length ? context.segment.matchedIndices : match.indices,
        },
      }
    }),
    [allSegments, matchResults]
  )

  const relations = useMemo(() => data.relations || [], [data.relations])
  const [activeTab, setActiveTab] = useState('structure')
  const [stageFilter, setStageFilter] = useState('all')
  const [relationFilter, setRelationFilter] = useState('all')
  const [query, setQuery] = useState('')
  const [selectedSegmentId, setSelectedSegmentId] = useState(hydratedSegments[0]?.segment.id || '')
  const [companyContext, setCompanyContext] = useState<CompanyContext | null>(null)
  const [investmentContext, setInvestmentContext] = useState<CompanyInvestmentContext | null>(null)
  const [investmentLoading, setInvestmentLoading] = useState(false)
  const [investmentError, setInvestmentError] = useState<string | null>(null)

  const segmentLookup = useMemo(() => {
    const lookup = new Map<string, SegmentContext>()
    hydratedSegments.forEach(context => {
      lookup.set(context.segment.id, context)
      lookup.set(context.segment.code, context)
    })
    return lookup
  }, [hydratedSegments])

  const normalizedQuery = query.trim().toLocaleLowerCase('zh-CN')
  const visibleSegments = useMemo(
    () => hydratedSegments.filter(context => {
      const matchesStage = stageFilter === 'all' || context.stage.id === stageFilter
      const matchesQuery = !normalizedQuery || searchableText(context).includes(normalizedQuery)
      return matchesStage && matchesQuery
    }),
    [hydratedSegments, normalizedQuery, stageFilter]
  )

  const selectedContext = visibleSegments.find(context => context.segment.id === selectedSegmentId)
    || visibleSegments[0]
    || hydratedSegments[0]
  const selectedRelations = selectedContext
    ? relations.filter(relation =>
        relation.sourceId === selectedContext.segment.id ||
        relation.targetId === selectedContext.segment.id ||
        relation.sourceCode === selectedContext.segment.code ||
        relation.targetCode === selectedContext.segment.code
      )
    : []

  const filteredRelations = relations.filter(relation => {
    const matchesType = relationFilter === 'all' || relation.type === relationFilter
    const relationText = [
      relation.sourceName,
      relation.targetName,
      relation.description,
      RELATION_LABELS[relation.type],
    ].filter(Boolean).join(' ').toLocaleLowerCase('zh-CN')
    return matchesType && (!normalizedQuery || relationText.includes(normalizedQuery))
  })

  const totalCompanies = hydratedSegments.reduce((sum, item) => sum + item.segment.companies.length, 0)
  const mappedSegments = hydratedSegments.filter(item =>
    (item.segment.matchedEtfs?.length || 0) + (item.segment.matchedIndices?.length || 0) > 0
  )
  const evidencedRelations = relations.filter(relation => relation.sourceUrls?.length).length
  const evidenceCoverage = relations.length ? Math.round(evidencedRelations / relations.length * 100) : 0
  const relationCountBySegment = useMemo(() => {
    const counts = new Map<string, number>()
    relations.forEach(relation => {
      counts.set(relation.sourceId, (counts.get(relation.sourceId) || 0) + 1)
      counts.set(relation.targetId, (counts.get(relation.targetId) || 0) + 1)
      counts.set(relation.sourceCode, (counts.get(relation.sourceCode) || 0) + 1)
      counts.set(relation.targetCode, (counts.get(relation.targetCode) || 0) + 1)
    })
    return counts
  }, [relations])

  const selectRelatedSegment = (relation: SegmentRelation, side: 'source' | 'target') => {
    const context = segmentLookup.get(side === 'source' ? relation.sourceId : relation.targetId)
      || segmentLookup.get(side === 'source' ? relation.sourceCode : relation.targetCode)
    if (!context) return
    setStageFilter('all')
    setSelectedSegmentId(context.segment.id)
    setActiveTab('structure')
  }

  const openCompany = (context: CompanyContext) => {
    setInvestmentContext(null)
    setInvestmentError(null)
    setCompanyContext(context)
    onCompanyClick?.(context.company.id)
  }

  const loadInvestmentContext = async () => {
    if (!companyContext) return
    setInvestmentLoading(true)
    setInvestmentError(null)
    try {
      const response = await fetch(
        `/api/graph/companies/${encodeURIComponent(companyContext.company.id)}/investment-context?industryId=${encodeURIComponent(data.industry.id)}`
      )
      const payload = await response.json()
      if (!response.ok || !payload.success) throw new Error(payload.error || '获取企业投资映射失败')
      setInvestmentContext(payload.data)
    } catch (error) {
      setInvestmentError(error instanceof Error ? error.message : '获取企业投资映射失败')
    } finally {
      setInvestmentLoading(false)
    }
  }

  return (
    <div className="space-y-4">
      <section aria-labelledby="graph-overview-title" className="space-y-3">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-primary">Graph overview</p>
            <h2 id="graph-overview-title" className="mt-1 text-xl font-semibold tracking-tight">
              {data.industry.name}全景
            </h2>
          </div>
          <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            <Badge variant="secondary" className="font-mono tabular-nums">认知版本 v{data.industry.version || 0}</Badge>
            {data.industry.revisionId ? (
              <Badge variant="outline" className="gap-1.5 font-mono">
                <CheckCircle2 className="size-3 text-emerald-600" aria-hidden="true" />
                {data.industry.revisionId.slice(0, 8)}
              </Badge>
            ) : (
              <Badge variant="outline">待发布版本</Badge>
            )}
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
          <MetricCard icon={Layers3} label="产业阶段" value={sortedStages.length} detail="产业链一级结构" />
          <MetricCard icon={CircleDot} label="产业环节" value={hydratedSegments.length} detail="可定位分析节点" />
          <MetricCard icon={Building2} label="相关企业" value={totalCompanies} detail="节点内企业合计" />
          <MetricCard icon={Link2} label="传导关系" value={relations.length} detail={`${evidenceCoverage}% 已关联证据`} />
          <MetricCard icon={TrendingUp} label="投资映射" value={mappedSegments.length} detail="已匹配 ETF / 指数的环节" />
        </div>
      </section>

      <Card className="overflow-hidden border-border/80 shadow-sm">
        <CardHeader className="gap-4 border-b bg-muted/25 px-4 py-4 sm:px-5">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <CardTitle className="text-base">产业知识工作区</CardTitle>
              <p className="mt-1 text-xs text-muted-foreground">从结构、关系或投资标的切入，逐层定位产业环节。</p>
            </div>
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
              <div className="relative min-w-0 sm:w-72">
                <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
                <Input
                  value={query}
                  onChange={event => setQuery(event.target.value)}
                  placeholder="搜索环节、企业、代码或 ETF"
                  aria-label="搜索知识图谱"
                  className="h-10 pl-9"
                />
              </div>
              <Select value={stageFilter} onValueChange={value => value && setStageFilter(value)}>
                <SelectTrigger className="h-10 w-full sm:w-40" aria-label="按产业阶段筛选">
                  <SelectValue>
                    {stageFilter === 'all' ? '全部阶段' : sortedStages.find(stage => stage.id === stageFilter)?.name}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">全部阶段</SelectItem>
                  {sortedStages.map(stage => <SelectItem key={stage.id} value={stage.id}>{stage.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>

          <nav aria-label="产业阶段导航" className="grid gap-2 md:grid-flow-col md:auto-cols-fr">
            {sortedStages.map((stage, index) => {
              const isActive = stageFilter === stage.id
              const companyCount = stage.segments.reduce((sum, segment) => sum + segment.companies.length, 0)
              return (
                <div key={stage.id} className="flex min-w-0 items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setStageFilter(isActive ? 'all' : stage.id)}
                    aria-pressed={isActive}
                    className={cn(
                      'min-h-16 min-w-0 flex-1 cursor-pointer rounded-xl border px-3 py-2.5 text-left transition-colors duration-200 focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50',
                      isActive
                        ? 'border-primary bg-primary text-primary-foreground shadow-sm'
                        : 'bg-background hover:border-primary/40 hover:bg-accent/50'
                    )}
                  >
                    <span className={cn('text-[11px] font-medium tabular-nums', isActive ? 'text-primary-foreground/70' : 'text-muted-foreground')}>
                      阶段 {String(index + 1).padStart(2, '0')}
                    </span>
                    <span className="mt-0.5 block truncate text-sm font-semibold">{stage.name}</span>
                    <span className={cn('mt-1 block text-[11px]', isActive ? 'text-primary-foreground/75' : 'text-muted-foreground')}>
                      {stage.segments.length} 环节 · {companyCount} 企业
                    </span>
                  </button>
                  {index < sortedStages.length - 1 && <ArrowRight className="hidden size-4 shrink-0 text-muted-foreground/50 md:block" aria-hidden="true" />}
                </div>
              )
            })}
          </nav>
        </CardHeader>

        <CardContent className="p-0">
          <Tabs value={activeTab} onValueChange={setActiveTab} className="gap-0">
            <div className="border-b px-4 py-2.5 sm:px-5">
              <TabsList className="grid h-auto w-full grid-cols-3 bg-muted/70 p-1 sm:w-[430px]">
                <TabsTrigger value="structure" className="min-h-10 gap-2">
                  <Layers3 className="size-4" aria-hidden="true" />结构视图
                </TabsTrigger>
                <TabsTrigger value="relations" className="min-h-10 gap-2">
                  <Network className="size-4" aria-hidden="true" />关系脉络
                </TabsTrigger>
                <TabsTrigger value="mapping" className="min-h-10 gap-2">
                  <BarChart3 className="size-4" aria-hidden="true" />投资映射
                </TabsTrigger>
              </TabsList>
            </div>

            <TabsContent value="structure" className="m-0">
              <div className="grid min-h-[620px] xl:grid-cols-[minmax(0,1fr)_380px]">
                <div className="min-w-0 p-4 sm:p-5">
                  <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <h3 className="font-semibold">产业链结构</h3>
                      <p className="mt-0.5 text-xs text-muted-foreground">选择环节，在右侧查看企业、映射与上下游关系。</p>
                    </div>
                    <Badge variant="outline" className="font-mono tabular-nums">{visibleSegments.length} / {hydratedSegments.length} 节点</Badge>
                  </div>

                  {visibleSegments.length === 0 ? (
                    <div className="flex min-h-72 flex-col items-center justify-center rounded-xl border border-dashed bg-muted/20 p-6 text-center">
                      <Search className="size-8 text-muted-foreground/60" aria-hidden="true" />
                      <p className="mt-3 text-sm font-medium">没有匹配的产业环节</p>
                      <p className="mt-1 text-xs text-muted-foreground">尝试清除关键词或切换到全部阶段。</p>
                      <Button variant="outline" className="mt-4" onClick={() => { setQuery(''); setStageFilter('all') }}>清除筛选</Button>
                    </div>
                  ) : (
                    <div className="space-y-5">
                      {sortedStages.map((stage, stageIndex) => {
                        const stageSegments = visibleSegments.filter(item => item.stage.id === stage.id)
                        if (stageSegments.length === 0) return null
                        return (
                          <section key={stage.id} aria-labelledby={`stage-${stage.id}`} className="relative rounded-xl border bg-muted/15 p-3.5 sm:p-4">
                            <div className="mb-3 flex items-start gap-3">
                              <div className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary font-mono text-xs font-semibold text-primary-foreground tabular-nums">
                                {String(stageIndex + 1).padStart(2, '0')}
                              </div>
                              <div className="min-w-0 flex-1">
                                <div className="flex flex-wrap items-center gap-2">
                                  <h3 id={`stage-${stage.id}`} className="font-semibold">{stage.name}</h3>
                                  <Badge variant="secondary" className="text-[11px]">{stageSegments.length} 个环节</Badge>
                                </div>
                                {stage.description && <p className="mt-1 text-xs leading-5 text-muted-foreground">{stage.description}</p>}
                              </div>
                            </div>

                            <div className="grid gap-2.5 sm:grid-cols-2 2xl:grid-cols-3">
                              {stageSegments.map(({ segment }) => {
                                const selected = selectedContext?.segment.id === segment.id
                                const mappingCount = (segment.matchedEtfs?.length || 0) + (segment.matchedIndices?.length || 0)
                                const relationCount = relationCountBySegment.get(segment.id) || relationCountBySegment.get(segment.code) || 0
                                return (
                                  <button
                                    key={segment.id}
                                    type="button"
                                    onClick={() => setSelectedSegmentId(segment.id)}
                                    aria-pressed={selected}
                                    className={cn(
                                      'group min-h-28 cursor-pointer rounded-xl border bg-card p-3.5 text-left shadow-sm transition-colors duration-200 focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50',
                                      selected ? 'border-primary ring-1 ring-primary/20' : 'hover:border-primary/40 hover:bg-accent/30'
                                    )}
                                  >
                                    <div className="flex items-start justify-between gap-3">
                                      <div className="min-w-0">
                                        <span className="block truncate text-sm font-semibold">{segment.name}</span>
                                        <span className="mt-0.5 block font-mono text-[10px] text-muted-foreground">{segment.code}</span>
                                      </div>
                                      <ChevronRight className={cn('mt-0.5 size-4 shrink-0 transition-transform duration-200', selected ? 'translate-x-0.5 text-primary' : 'text-muted-foreground group-hover:translate-x-0.5')} aria-hidden="true" />
                                    </div>
                                    {segment.description && <p className="mt-2 line-clamp-2 text-xs leading-5 text-muted-foreground">{segment.description}</p>}
                                    <div className="mt-3 flex flex-wrap gap-1.5 text-[11px] text-muted-foreground">
                                      <span className="rounded-md bg-muted px-1.5 py-0.5">{segment.companies.length} 企业</span>
                                      <span className="rounded-md bg-muted px-1.5 py-0.5">{relationCount} 关系</span>
                                      {mappingCount > 0 && <span className="rounded-md bg-primary/10 px-1.5 py-0.5 text-primary">{mappingCount} 映射</span>}
                                    </div>
                                  </button>
                                )
                              })}
                            </div>
                            {stageIndex < sortedStages.length - 1 && (
                              <div className="absolute -bottom-5 left-7 z-10 flex size-6 items-center justify-center rounded-full border bg-background text-muted-foreground">
                                <ArrowDown className="size-3.5" aria-hidden="true" />
                              </div>
                            )}
                          </section>
                        )
                      })}
                    </div>
                  )}
                </div>

                <aside aria-label="节点详情" className="min-w-0 border-t bg-muted/15 xl:border-l xl:border-t-0">
                  {selectedContext ? (
                    <ScrollArea className="h-auto xl:h-[760px]">
                      <div className="space-y-5 p-4 sm:p-5">
                        <div>
                          <div className="flex flex-wrap items-center gap-2">
                            <Badge variant="secondary">{selectedContext.stage.name}</Badge>
                            <span className="font-mono text-[11px] text-muted-foreground">{selectedContext.segment.code}</span>
                          </div>
                          <h3 className="mt-2 text-lg font-semibold tracking-tight">{selectedContext.segment.name}</h3>
                          <p className="mt-1 text-sm leading-6 text-muted-foreground">
                            {selectedContext.segment.description || '该环节暂未补充结构说明。'}
                          </p>
                          {!!selectedContext.segment.keyCategories?.length && (
                            <div className="mt-3 flex flex-wrap gap-1.5">
                              {selectedContext.segment.keyCategories.map(category => <Badge key={category} variant="outline">{category}</Badge>)}
                            </div>
                          )}
                        </div>

                        <div className="grid grid-cols-3 gap-2">
                          <div className="rounded-lg border bg-background p-2.5 text-center">
                            <p className="font-mono text-lg font-semibold tabular-nums">{selectedContext.segment.companies.length}</p>
                            <p className="text-[11px] text-muted-foreground">企业</p>
                          </div>
                          <div className="rounded-lg border bg-background p-2.5 text-center">
                            <p className="font-mono text-lg font-semibold tabular-nums">{selectedRelations.length}</p>
                            <p className="text-[11px] text-muted-foreground">关系</p>
                          </div>
                          <div className="rounded-lg border bg-background p-2.5 text-center">
                            <p className="font-mono text-lg font-semibold tabular-nums">{(selectedContext.segment.matchedEtfs?.length || 0) + (selectedContext.segment.matchedIndices?.length || 0)}</p>
                            <p className="text-[11px] text-muted-foreground">映射</p>
                          </div>
                        </div>

                        <section aria-labelledby="selected-relations-title">
                          <div className="mb-2 flex items-center justify-between gap-2">
                            <h4 id="selected-relations-title" className="text-sm font-semibold">上下游关系</h4>
                            <Button variant="ghost" size="xs" onClick={() => setActiveTab('relations')}>查看全部</Button>
                          </div>
                          {selectedRelations.length ? (
                            <div className="space-y-2">
                              {selectedRelations.slice(0, 5).map((relation, index) => {
                                const isOutgoing = relation.sourceId === selectedContext.segment.id || relation.sourceCode === selectedContext.segment.code
                                return (
                                  <button
                                    type="button"
                                    key={`${relation.sourceId}-${relation.targetId}-${index}`}
                                    onClick={() => selectRelatedSegment(relation, isOutgoing ? 'target' : 'source')}
                                    className="flex min-h-11 w-full cursor-pointer items-center gap-2 rounded-lg border bg-background p-2.5 text-left transition-colors hover:border-primary/40 hover:bg-accent/30 focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
                                  >
                                    {isOutgoing ? <ArrowRight className="size-4 shrink-0 text-primary" /> : <ArrowRight className="size-4 shrink-0 rotate-180 text-primary" />}
                                    <div className="min-w-0 flex-1">
                                      <p className="truncate text-xs font-medium">{isOutgoing ? relation.targetName : relation.sourceName}</p>
                                      <p className="mt-0.5 text-[11px] text-muted-foreground">{isOutgoing ? '下游' : '上游'} · {RELATION_LABELS[relation.type]}</p>
                                    </div>
                                    <Badge variant="outline" className={cn('shrink-0 text-[10px]', relationTone(relation.direction))}>{DIRECTION_LABELS[relation.direction]}</Badge>
                                  </button>
                                )
                              })}
                            </div>
                          ) : <p className="rounded-lg border border-dashed p-3 text-xs text-muted-foreground">暂无可展示的传导关系。</p>}
                        </section>

                        <section aria-labelledby="selected-companies-title">
                          <h4 id="selected-companies-title" className="mb-2 text-sm font-semibold">代表企业</h4>
                          {selectedContext.segment.companies.length ? (
                            <div className="space-y-2">
                              {selectedContext.segment.companies.map(company => (
                                <button
                                  key={company.id}
                                  type="button"
                                  onClick={() => openCompany({ company, segment: selectedContext.segment, stage: selectedContext.stage })}
                                  className="flex min-h-12 w-full cursor-pointer items-center gap-3 rounded-lg border bg-background p-2.5 text-left transition-colors hover:border-primary/40 hover:bg-accent/30 focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
                                >
                                  <div className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                                    <Building2 className="size-4" aria-hidden="true" />
                                  </div>
                                  <div className="min-w-0 flex-1">
                                    <p className="truncate text-xs font-semibold">{company.name}</p>
                                    <p className="mt-0.5 truncate font-mono text-[11px] text-muted-foreground">{company.ticker || company.nameEn || company.country}</p>
                                  </div>
                                  <Badge variant="outline" className="text-[10px]">{POSITION_LABELS[company.marketPosition]}</Badge>
                                </button>
                              ))}
                            </div>
                          ) : <p className="rounded-lg border border-dashed p-3 text-xs text-muted-foreground">暂无企业数据。</p>}
                        </section>

                        <section aria-labelledby="selected-mapping-title">
                          <h4 id="selected-mapping-title" className="mb-2 text-sm font-semibold">ETF / 指数映射</h4>
                          <div className="space-y-2">
                            {selectedContext.segment.matchedEtfs?.map(etf => <MappingBadge key={`etf-${etf.code}`} {...etf} />)}
                            {selectedContext.segment.matchedIndices?.map(index => <MappingBadge key={`index-${index.code}`} {...index} />)}
                            {!(selectedContext.segment.matchedEtfs?.length || selectedContext.segment.matchedIndices?.length) && (
                              <NodeETFIndexDisplay nodeId={selectedContext.segment.id} nodeName={selectedContext.segment.name} />
                            )}
                          </div>
                        </section>
                      </div>
                    </ScrollArea>
                  ) : (
                    <div className="flex min-h-72 items-center justify-center p-6 text-sm text-muted-foreground">请选择一个产业环节</div>
                  )}
                </aside>
              </div>
            </TabsContent>

            <TabsContent value="relations" className="m-0 p-4 sm:p-5">
              <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
                <div>
                  <h3 className="font-semibold">关系脉络</h3>
                  <p className="mt-1 text-xs text-muted-foreground">按传导类型、方向和证据置信度检查环节之间的影响。</p>
                </div>
                <Select value={relationFilter} onValueChange={value => value && setRelationFilter(value)}>
                  <SelectTrigger className="h-10 w-full sm:w-40" aria-label="按关系类型筛选">
                    <SelectValue>{relationFilter === 'all' ? '全部关系' : RELATION_LABELS[relationFilter as SegmentRelation['type']]}</SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">全部关系</SelectItem>
                    {Object.entries(RELATION_LABELS).map(([value, label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>

              <div className="mb-4 grid gap-3 sm:grid-cols-3">
                <div className="rounded-xl border bg-muted/20 p-3">
                  <p className="text-xs text-muted-foreground">筛选后关系</p>
                  <p className="mt-1 font-mono text-xl font-semibold tabular-nums">{filteredRelations.length}</p>
                </div>
                <div className="rounded-xl border bg-muted/20 p-3">
                  <p className="text-xs text-muted-foreground">证据覆盖</p>
                  <div className="mt-1 flex items-center gap-3"><p className="font-mono text-xl font-semibold tabular-nums">{evidenceCoverage}%</p><Progress value={evidenceCoverage} className="h-1.5 flex-1" /></div>
                </div>
                <div className="rounded-xl border bg-muted/20 p-3">
                  <p className="text-xs text-muted-foreground">高置信关系</p>
                  <p className="mt-1 font-mono text-xl font-semibold tabular-nums">{relations.filter(relation => relation.confidence >= 0.8).length}</p>
                </div>
              </div>

              {filteredRelations.length ? (
                <div className="space-y-2.5">
                  {filteredRelations.map((relation, index) => (
                    <article key={`${relation.sourceId}-${relation.targetId}-${index}`} className="rounded-xl border bg-card p-3.5 shadow-sm">
                      <div className="grid items-center gap-3 lg:grid-cols-[minmax(0,1fr)_180px_minmax(0,1fr)]">
                        <button type="button" onClick={() => selectRelatedSegment(relation, 'source')} className="min-h-11 cursor-pointer rounded-lg border bg-muted/20 p-2.5 text-left transition-colors hover:border-primary/40 focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50">
                          <span className="block text-[10px] font-medium uppercase tracking-wider text-muted-foreground">来源环节</span>
                          <span className="mt-1 block truncate text-sm font-semibold">{relation.sourceName}</span>
                        </button>
                        <div className="flex items-center justify-center gap-2 lg:flex-col">
                          <div className="flex items-center gap-2">
                            {relation.direction === 'negative' ? <TrendingDown className="size-4 text-red-600" /> : <TrendingUp className="size-4 text-emerald-600" />}
                            <span className="text-xs font-medium">{RELATION_LABELS[relation.type]}</span>
                            <ArrowRight className="size-4 text-muted-foreground" />
                          </div>
                          <div className="flex gap-1.5">
                            <Badge variant="outline" className={cn('text-[10px]', relationTone(relation.direction))}>{DIRECTION_LABELS[relation.direction]}</Badge>
                            <Badge variant="outline" className="font-mono text-[10px] tabular-nums">置信 {Math.round(relation.confidence * 100)}%</Badge>
                          </div>
                        </div>
                        <button type="button" onClick={() => selectRelatedSegment(relation, 'target')} className="min-h-11 cursor-pointer rounded-lg border bg-muted/20 p-2.5 text-left transition-colors hover:border-primary/40 focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50">
                          <span className="block text-[10px] font-medium uppercase tracking-wider text-muted-foreground">目标环节</span>
                          <span className="mt-1 block truncate text-sm font-semibold">{relation.targetName}</span>
                        </button>
                      </div>
                      {(relation.description || relation.lag || relation.sourceUrls?.length) && (
                        <div className="mt-3 flex flex-col gap-2 border-t pt-3 text-xs text-muted-foreground sm:flex-row sm:items-start sm:justify-between">
                          <p className="leading-5">{relation.description || '暂无传导说明'}</p>
                          <div className="flex shrink-0 flex-wrap items-center gap-2">
                            {relation.lag && <Badge variant="secondary">滞后 {relation.lag}</Badge>}
                            {relation.sourceUrls?.filter(isSafeEvidenceUrl).slice(0, 2).map((url, sourceIndex) => (
                              <a key={url} href={url} target="_blank" rel="noreferrer" className="inline-flex min-h-8 cursor-pointer items-center gap-1 rounded-md px-2 text-primary underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50">
                                证据 {sourceIndex + 1}<ExternalLink className="size-3" aria-hidden="true" />
                              </a>
                            ))}
                          </div>
                        </div>
                      )}
                    </article>
                  ))}
                </div>
              ) : (
                <div className="rounded-xl border border-dashed p-10 text-center text-sm text-muted-foreground">当前筛选条件下没有关系数据。</div>
              )}
            </TabsContent>

            <TabsContent value="mapping" className="m-0 p-4 sm:p-5">
              <div className="mb-4">
                <h3 className="font-semibold">投资映射</h3>
                <p className="mt-1 text-xs text-muted-foreground">从产业环节查看可投资的指数与 ETF，不展示个股推荐。</p>
              </div>
              {mappedSegments.length ? (
                <div className="grid gap-3 lg:grid-cols-2 2xl:grid-cols-3">
                  {mappedSegments
                    .filter(context => stageFilter === 'all' || context.stage.id === stageFilter)
                    .filter(context => !normalizedQuery || searchableText(context).includes(normalizedQuery))
                    .map(({ stage, segment }) => (
                      <article key={segment.id} className="rounded-xl border bg-card p-4 shadow-sm">
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <Badge variant="secondary" className="text-[10px]">{stage.name}</Badge>
                            <h3 className="mt-2 truncate text-sm font-semibold">{segment.name}</h3>
                            <p className="mt-0.5 font-mono text-[10px] text-muted-foreground">{segment.code}</p>
                          </div>
                          <Button variant="ghost" size="xs" onClick={() => { setSelectedSegmentId(segment.id); setActiveTab('structure') }}>查看节点</Button>
                        </div>
                        <div className="mt-3 space-y-2">
                          {segment.matchedEtfs?.map(etf => <MappingBadge key={`mapping-etf-${segment.id}-${etf.code}`} {...etf} />)}
                          {segment.matchedIndices?.map(index => <MappingBadge key={`mapping-index-${segment.id}-${index.code}`} {...index} />)}
                        </div>
                      </article>
                    ))}
                </div>
              ) : (
                <div className="rounded-xl border border-dashed bg-muted/20 p-10 text-center">
                  <BarChart3 className="mx-auto size-8 text-muted-foreground/60" aria-hidden="true" />
                  <p className="mt-3 text-sm font-medium">尚未生成投资映射</p>
                  <p className="mt-1 text-xs text-muted-foreground">可使用页面顶部的“匹配 ETF / 指数”能力生成映射。</p>
                </div>
              )}
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>

      {!data.industry.revisionId && (
        <div role="status" className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800 dark:border-amber-900/60 dark:bg-amber-950/30 dark:text-amber-300">
          <ShieldCheck className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          该图谱尚未发布为可追溯版本；完成审核并发布后，将生成版本标识和关系证据摘要。
        </div>
      )}

      <Sheet open={Boolean(companyContext)} onOpenChange={open => {
        if (!open) {
          setCompanyContext(null)
          setInvestmentContext(null)
          setInvestmentError(null)
        }
      }}>
        <SheetContent className="w-full overflow-y-auto sm:max-w-lg">
          {companyContext && (
            <>
              <SheetHeader className="border-b p-5 pr-14">
                <div className="mb-2 flex flex-wrap gap-2">
                  <Badge variant="secondary">{companyContext.stage.name}</Badge>
                  <Badge variant="outline">{companyContext.segment.name}</Badge>
                </div>
                <SheetTitle className="text-xl">{companyContext.company.name}</SheetTitle>
                <SheetDescription>{companyContext.company.nameEn || companyContext.company.ticker || '企业节点详情'}</SheetDescription>
              </SheetHeader>
              <div className="space-y-5 p-5">
                <div className="grid grid-cols-2 gap-3">
                  <div className="rounded-xl border bg-muted/20 p-3">
                    <p className="text-xs text-muted-foreground">市场地位</p>
                    <p className="mt-1 text-sm font-semibold">{POSITION_LABELS[companyContext.company.marketPosition]}</p>
                  </div>
                  <div className="rounded-xl border bg-muted/20 p-3">
                    <p className="text-xs text-muted-foreground">国家 / 地区</p>
                    <p className="mt-1 text-sm font-semibold">{companyContext.company.country}</p>
                  </div>
                  <div className="col-span-2 rounded-xl border bg-muted/20 p-3">
                    <p className="text-xs text-muted-foreground">证券代码</p>
                    <p className="mt-1 font-mono text-sm font-semibold">{companyContext.company.ticker || '未关联'}{companyContext.company.exchange ? ` · ${companyContext.company.exchange}` : ''}</p>
                  </div>
                </div>
                <section className="rounded-xl border border-primary/20 bg-primary/5 p-3.5">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <h3 className="flex items-center gap-2 text-sm font-semibold">
                        <FileCheck2 className="size-4 text-primary" aria-hidden="true" />
                        投资关联与证据
                      </h3>
                      <p className="mt-1 text-xs leading-5 text-muted-foreground">查看该企业对应的代表 ETF、指数、同环节企业及持仓验证状态。</p>
                    </div>
                    <Button
                      variant={investmentContext ? 'outline' : 'default'}
                      size="sm"
                      onClick={() => void loadInvestmentContext()}
                      disabled={investmentLoading}
                      className="min-h-11"
                    >
                      {investmentLoading ? <Loader2 className="size-4 animate-spin" /> : <Link2 className="size-4" />}
                      {investmentContext ? '刷新映射' : '查看投资映射'}
                    </Button>
                  </div>
                  {investmentError && <p role="alert" className="mt-3 rounded-lg border border-destructive/30 bg-destructive/5 p-2.5 text-xs text-destructive">{investmentError}</p>}
                  {investmentContext && (
                    <div className="mt-4 space-y-4 border-t border-primary/15 pt-4">
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge variant="outline" className={investmentContext.evidence.level === 'holding_verified' ? 'border-emerald-300 bg-emerald-50 text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-300' : ''}>
                          {investmentContext.evidence.level === 'holding_verified' ? `${investmentContext.evidence.verifiedEtfCount} 只ETF持仓已验证` : '仅产业语义映射'}
                        </Badge>
                        <Badge variant="outline" className="font-mono tabular-nums">代表性 {Math.round(investmentContext.company.representativenessScore * 100)}%</Badge>
                        <Badge variant="outline" className="font-mono tabular-nums">置信度 {Math.round(investmentContext.company.matchConfidence * 100)}%</Badge>
                      </div>
                      {investmentContext.company.selectionReason && <p className="text-xs leading-5 text-muted-foreground">{investmentContext.company.selectionReason}</p>}

                      <div>
                        <h4 className="mb-2 flex items-center gap-2 text-xs font-semibold"><TrendingUp className="size-3.5" />代表 ETF</h4>
                        {investmentContext.representativeEtfs.length ? (
                          <div className="space-y-2">
                            {investmentContext.representativeEtfs.map(etf => (
                              <div key={etf.code} className="rounded-lg border bg-background p-2.5">
                                <div className="flex items-center gap-2">
                                  <Badge variant="secondary" className="font-mono text-[10px]">{etf.code}</Badge>
                                  <span className="min-w-0 flex-1 truncate text-xs font-medium">{etf.name}</span>
                                  <Badge variant="outline" className="text-[10px]">{etf.holdingVerified ? `持仓 ${etf.holdingWeight?.toFixed(2) || '-'}%` : '语义映射'}</Badge>
                                </div>
                                <p className="mt-1.5 text-[11px] leading-4 text-muted-foreground">{etf.reasoning}</p>
                              </div>
                            ))}
                          </div>
                        ) : <p className="text-xs text-muted-foreground">暂无代表 ETF。</p>}
                      </div>

                      <div>
                        <h4 className="mb-2 flex items-center gap-2 text-xs font-semibold"><BarChart3 className="size-3.5" />代表指数</h4>
                        {investmentContext.representativeIndices.length ? (
                          <div className="flex flex-wrap gap-2">
                            {investmentContext.representativeIndices.map(index => <Badge key={index.code} variant="outline" className="gap-1.5"><span className="font-mono text-[10px]">{index.code}</span>{index.name}</Badge>)}
                          </div>
                        ) : <p className="text-xs text-muted-foreground">暂无代表指数。</p>}
                      </div>

                      <div>
                        <h4 className="mb-2 flex items-center gap-2 text-xs font-semibold"><Users className="size-3.5" />同环节代表企业</h4>
                        {investmentContext.peerCompanies.length ? (
                          <div className="grid gap-2 sm:grid-cols-2">
                            {investmentContext.peerCompanies.slice(0, 6).map(peer => (
                              <div key={peer.id} className="rounded-lg border bg-background px-2.5 py-2">
                                <p className="truncate text-xs font-medium">{peer.name}</p>
                                <p className="mt-0.5 font-mono text-[10px] text-muted-foreground">{peer.ticker || '未关联代码'}</p>
                              </div>
                            ))}
                          </div>
                        ) : <p className="text-xs text-muted-foreground">暂无同环节企业。</p>}
                      </div>
                    </div>
                  )}
                </section>
                {companyContext.company.description && (
                  <section>
                    <h3 className="text-sm font-semibold">企业说明</h3>
                    <p className="mt-2 text-sm leading-6 text-muted-foreground">{companyContext.company.description}</p>
                  </section>
                )}
                {!!companyContext.company.keyProducts?.length && (
                  <section>
                    <h3 className="text-sm font-semibold">关键产品</h3>
                    <div className="mt-2 flex flex-wrap gap-2">
                      {companyContext.company.keyProducts.map(product => <Badge key={product} variant="outline">{product}</Badge>)}
                    </div>
                  </section>
                )}
                <div className="rounded-xl border border-primary/20 bg-primary/5 p-3 text-xs leading-5 text-muted-foreground">
                  企业信息用于解释产业环节构成，不构成个股推荐或交易建议。
                </div>
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>
    </div>
  )
}
