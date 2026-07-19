'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  TrendingUp,
  TrendingDown,
  Minus,
  RefreshCw,
  AlertTriangle,
  CheckCircle,
  BarChart3,
  GitBranch,
  ArrowRight,
  Activity,
} from 'lucide-react'
import { Domain } from '@/types/event'
import { EVENTS_TEXT } from '@/constants/events-text'
import { EventPageLayout } from '@/components/events/EventPageLayout'
import { PageHeader } from '@/components/events/PageHeader'
import { StatCardGrid } from '@/components/events/StatCardGrid'
import { StatCard } from '@/components/events/StatCard'
import { ContentSection } from '@/components/events/ContentSection'
import { LoadingSkeleton } from '@/components/events/LoadingSkeleton'

interface SectorTrend {
  sector: string
  period: string
  eventSummary: {
    totalEvents: number
    sentimentDistribution: {
      bullish: number
      neutral: number
      bearish: number
    }
  }
  trendAssessment: {
    currentStatus: string
    shortTermOutlook: string
    mediumTermOutlook: string
    keyDrivers: string[]
    keyRisks: string[]
    confidenceLevel: number
  }
}

interface PropagationNode {
  id: string
  name: string
  impact: number
  direction: 'positive' | 'negative'
}

interface PropagationData {
  propagationPath: PropagationNode[]
}

interface TrendCache {
  trend: SectorTrend
  timestamp: number
}

interface PropagationCache {
  propagation: PropagationData
  timestamp: number
}

const CACHE_TTL = 5 * 60 * 1000 // 5 minutes

export default function TrendsPage() {
  const [domains, setDomains] = useState<Domain[]>([])
  const [selectedDomain, setSelectedDomain] = useState<string | null>(null)
  const [trend, setTrend] = useState<SectorTrend | null>(null)
  const [isTrendLoading, setIsTrendLoading] = useState(false)
  const [propagationPath, setPropagationPath] = useState<PropagationNode[]>([])
  const [isPropagationLoading, setIsPropagationLoading] = useState(false)

  // Cache refs for performance
  const trendCacheRef = useRef<Map<string, TrendCache>>(new Map())
  const propagationCacheRef = useRef<Map<string, PropagationCache>>(new Map())

  // 获取领域数据
  const fetchDomains = async () => {
    try {
      const response = await fetch('/api/events/domains')
      if (response.ok) {
        const data = await response.json()
        if (data.success) {
          setDomains(data.data)
          if (data.data.length > 0 && !selectedDomain) {
            setSelectedDomain(data.data[0].code)
          }
        }
      }
    } catch (error) {
      console.error('获取领域失败:', error)
    }
  }

  // 获取趋势数据（带缓存）
  const fetchTrend = useCallback(async (domain: string, silent = false) => {
    // Check cache first
    const cached = trendCacheRef.current.get(domain)
    const now = Date.now()

    if (cached && (now - cached.timestamp) < CACHE_TTL) {
      // Use cached data immediately
      setTrend(cached.trend)
      if (silent) return // Skip refresh in silent mode
    }

    if (!silent) {
      setIsTrendLoading(true)
    }

    try {
      const response = await fetch(`/api/events/trends/${domain}`)
      if (response.ok) {
        const data = await response.json()
        if (data.success && data.data) {
          setTrend(data.data)
          // Update cache
          trendCacheRef.current.set(domain, {
            trend: data.data,
            timestamp: now,
          })
        }
      }
    } catch (error) {
      console.error('获取趋势失败:', error)
    } finally {
      if (!silent) {
        setIsTrendLoading(false)
      }
    }
  }, [])

  // 获取传导路径（带缓存）
  const fetchPropagationPath = useCallback(async (domainCode: string, silent = false) => {
    const domain = domains.find((d) => d.code === domainCode)
    if (!domain) return

    // Check cache first
    const cached = propagationCacheRef.current.get(domainCode)
    const now = Date.now()

    if (cached && (now - cached.timestamp) < CACHE_TTL) {
      // Use cached data immediately
      setPropagationPath(cached.propagation.propagationPath)
      if (silent) return // Skip refresh in silent mode
    }

    if (!silent) {
      setIsPropagationLoading(true)
    }

    try {
      const response = await fetch(`/api/events/propagation?domainId=${domain.id}`)
      if (response.ok) {
        const data = await response.json()
        if (data.success && data.data?.propagationPath) {
          setPropagationPath(data.data.propagationPath)
          // Update cache
          propagationCacheRef.current.set(domainCode, {
            propagation: data.data,
            timestamp: now,
          })
        } else {
          setPropagationPath([])
        }
      }
    } catch (error) {
      console.error('获取传导路径失败:', error)
      setPropagationPath([])
    } finally {
      if (!silent) {
        setIsPropagationLoading(false)
      }
    }
  }, [domains])

  useEffect(() => {
    fetchDomains()
  }, [])

  useEffect(() => {
    if (selectedDomain) {
      // Show cached data first, then refresh in background
      const cached = trendCacheRef.current.get(selectedDomain)
      if (cached) {
        setTrend(cached.trend)
        fetchTrend(selectedDomain, true) // Silent refresh
      } else {
        fetchTrend(selectedDomain, false) // Full loading
      }

      const cachedPropagation = propagationCacheRef.current.get(selectedDomain)
      if (cachedPropagation) {
        setPropagationPath(cachedPropagation.propagation.propagationPath)
        fetchPropagationPath(selectedDomain, true) // Silent refresh
      } else {
        fetchPropagationPath(selectedDomain, false) // Full loading
      }
    }
  }, [selectedDomain, fetchTrend, fetchPropagationPath])

  const handleDomainChange = (domain: string | null) => {
    setSelectedDomain(domain)
  }

  const handleRefresh = () => {
    if (selectedDomain) {
      // Clear cache and force refresh
      trendCacheRef.current.delete(selectedDomain)
      propagationCacheRef.current.delete(selectedDomain)
      fetchTrend(selectedDomain, false)
      fetchPropagationPath(selectedDomain, false)
    }
  }

  // Calculate stats
  const stats = {
    monitoredDomains: domains.filter(d => d.isActive).length,
    bullishSignals: trend?.eventSummary.sentimentDistribution.bullish || 0,
    bearishSignals: trend?.eventSummary.sentimentDistribution.bearish || 0,
    trendScore: trend ? Math.round(trend.trendAssessment.confidenceLevel * 100) : 0,
  }

  const isLoading = isTrendLoading && !trend
  const isRefreshing = isTrendLoading && !!trend

  return (
    <EventPageLayout>
      {/* Page Header */}
      <PageHeader
        title={EVENTS_TEXT.trends.title}
        description={EVENTS_TEXT.trends.description}
        actions={
          <Button
            variant="outline"
            size="sm"
            onClick={handleRefresh}
            disabled={isRefreshing}
          >
            <RefreshCw className={`mr-2 h-4 w-4 ${isRefreshing ? 'animate-spin' : ''}`} />
            {EVENTS_TEXT.common.refresh}
          </Button>
        }
      />

      {/* Top Stats */}
      <StatCardGrid>
        <StatCard
          icon={BarChart3}
          label={EVENTS_TEXT.trends.stats.monitoredDomains}
          value={stats.monitoredDomains}
          variant="default"
        />
        <StatCard
          icon={TrendingUp}
          label={EVENTS_TEXT.trends.stats.bullishSignals}
          value={stats.bullishSignals}
          variant="success"
        />
        <StatCard
          icon={TrendingDown}
          label={EVENTS_TEXT.trends.stats.bearishSignals}
          value={stats.bearishSignals}
          variant="danger"
        />
        <StatCard
          icon={Activity}
          label={EVENTS_TEXT.trends.stats.trendScore}
          value={stats.trendScore}
          variant={stats.trendScore >= 70 ? 'success' : stats.trendScore >= 50 ? 'warning' : 'default'}
        />
      </StatCardGrid>

      {/* Domain Selection */}
      <div className="flex items-center gap-4">
        <span className="text-sm font-medium">选择领域：</span>
        <Select value={selectedDomain || ''} onValueChange={handleDomainChange}>
          <SelectTrigger className="w-[200px]">
            <SelectValue placeholder="请选择领域">
              {selectedDomain
                ? domains.find(d => d.code === selectedDomain)?.name || '请选择领域'
                : '请选择领域'}
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            {domains.map((domain) => (
              <SelectItem key={domain.id} value={domain.code}>
                {domain.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Domain Tabs */}
      <div className="flex flex-wrap gap-2">
        {domains.map((domain) => (
          <Button
            key={domain.id}
            variant={selectedDomain === domain.code ? 'default' : 'outline'}
            size="sm"
            onClick={() => handleDomainChange(domain.code)}
          >
            {domain.name}
          </Button>
        ))}
      </div>

      {/* Main Content */}
      {isLoading ? (
        <LoadingSkeleton variant="card" count={4} />
      ) : trend ? (
        <>
          {/* Trend Overview and Statistics */}
          <div className="grid gap-6 md:grid-cols-2">
            {/* Trend Assessment */}
            <ContentSection
              title={
                selectedDomain
                  ? `${domains.find((d) => d.code === selectedDomain)?.name}${EVENTS_TEXT.trends.overview.sentiment}`
                  : EVENTS_TEXT.trends.overview.title
              }
            >
              <div className="space-y-4">
                <div className="p-4 bg-muted rounded-lg">
                  <p className="font-medium">{trend.trendAssessment.currentStatus}</p>
                  <p className="text-sm text-muted-foreground mt-2">
                    置信度: {(trend.trendAssessment.confidenceLevel * 100).toFixed(0)}%
                  </p>
                </div>

                <div className="space-y-3">
                  <div>
                    <h4 className="text-sm font-medium text-muted-foreground mb-1">短期展望</h4>
                    <p className="text-sm">{trend.trendAssessment.shortTermOutlook}</p>
                  </div>
                  <div>
                    <h4 className="text-sm font-medium text-muted-foreground mb-1">中期展望</h4>
                    <p className="text-sm">{trend.trendAssessment.mediumTermOutlook}</p>
                  </div>
                </div>
              </div>
            </ContentSection>

            {/* Event Statistics */}
            <ContentSection title={EVENTS_TEXT.trends.overview.events}>
              <div className="space-y-4">
                <div className="text-center p-4 bg-muted rounded-lg">
                  <p className="text-3xl font-bold">{trend.eventSummary.totalEvents}</p>
                  <p className="text-sm text-muted-foreground">{trend.period}事件总数</p>
                </div>

                <div className="grid grid-cols-3 gap-4">
                  <div className="text-center p-3 bg-green-50 dark:bg-green-900/20 rounded-lg">
                    <TrendingUp className="h-5 w-5 mx-auto text-green-500 mb-1" />
                    <p className="text-lg font-bold text-green-600">
                      {trend.eventSummary.sentimentDistribution.bullish}
                    </p>
                    <p className="text-xs text-muted-foreground">{EVENTS_TEXT.trends.sentiment.bullish}</p>
                  </div>
                  <div className="text-center p-3 bg-gray-50 dark:bg-gray-900/20 rounded-lg">
                    <Minus className="h-5 w-5 mx-auto text-gray-500 mb-1" />
                    <p className="text-lg font-bold text-gray-600">
                      {trend.eventSummary.sentimentDistribution.neutral}
                    </p>
                    <p className="text-xs text-muted-foreground">{EVENTS_TEXT.trends.sentiment.neutral}</p>
                  </div>
                  <div className="text-center p-3 bg-red-50 dark:bg-red-900/20 rounded-lg">
                    <TrendingDown className="h-5 w-5 mx-auto text-red-500 mb-1" />
                    <p className="text-lg font-bold text-red-600">
                      {trend.eventSummary.sentimentDistribution.bearish}
                    </p>
                    <p className="text-xs text-muted-foreground">{EVENTS_TEXT.trends.sentiment.bearish}</p>
                  </div>
                </div>
              </div>
            </ContentSection>

            {/* Key Drivers */}
            <ContentSection title={EVENTS_TEXT.trends.factors.driversTitle}>
              {trend.trendAssessment.keyDrivers.length > 0 ? (
                <ul className="space-y-2">
                  {trend.trendAssessment.keyDrivers.map((driver, index) => (
                    <li key={index} className="flex items-start gap-2">
                      <CheckCircle className="h-4 w-4 text-green-500 mt-0.5 shrink-0" />
                      <span className="text-sm">{driver}</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-muted-foreground">{EVENTS_TEXT.trends.factors.noDrivers}</p>
              )}
            </ContentSection>

            {/* Key Risks */}
            <ContentSection title={EVENTS_TEXT.trends.factors.risksTitle}>
              {trend.trendAssessment.keyRisks.length > 0 ? (
                <ul className="space-y-2">
                  {trend.trendAssessment.keyRisks.map((risk, index) => (
                    <li key={index} className="flex items-start gap-2">
                      <AlertTriangle className="h-4 w-4 text-yellow-500 mt-0.5 shrink-0" />
                      <span className="text-sm">{risk}</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-muted-foreground">{EVENTS_TEXT.trends.factors.noRisks}</p>
              )}
            </ContentSection>
          </div>

          {/* Propagation Path */}
          <ContentSection
            title={EVENTS_TEXT.trends.propagation.title}
          >
            {isPropagationLoading && propagationPath.length === 0 ? (
              <div className="flex items-center justify-center py-8">
                <RefreshCw className="h-6 w-6 animate-spin text-muted-foreground" />
                <span className="ml-2 text-sm text-muted-foreground">
                  {EVENTS_TEXT.trends.loading.loadingPropagation}
                </span>
              </div>
            ) : propagationPath.length > 0 ? (
              <>
                <div className="flex items-center gap-2 overflow-x-auto py-4">
                  {propagationPath.map((node, index) => (
                    <div key={node.id} className="flex items-center">
                      <div
                        className={`p-4 rounded-lg border ${
                          node.direction === 'positive'
                            ? 'bg-green-50 border-green-200 dark:bg-green-900/20 dark:border-green-800'
                            : 'bg-red-50 border-red-200 dark:bg-red-900/20 dark:border-red-800'
                        }`}
                      >
                        <p className="font-medium">{node.name}</p>
                        <p className="text-xs text-muted-foreground">
                          影响: {(node.impact * 100).toFixed(0)}%
                        </p>
                      </div>
                      {index < propagationPath.length - 1 && (
                        <ArrowRight className="mx-2 h-4 w-4 text-muted-foreground shrink-0" />
                      )}
                    </div>
                  ))}
                </div>
                <div className="mt-4 text-sm text-muted-foreground">
                  <p>传导路径展示事件如何从上游传导至下游，影响权重表示关联强度。</p>
                </div>
              </>
            ) : (
              <p className="text-sm text-muted-foreground text-center py-8">
                {EVENTS_TEXT.trends.propagation.noPath}
              </p>
            )}
          </ContentSection>

          {/* Domain Keywords */}
          {selectedDomain && domains.find((d) => d.code === selectedDomain)?.keywords && (
            <ContentSection title="领域关键词">
              <div className="flex flex-wrap gap-2">
                {domains
                  .find((d) => d.code === selectedDomain)
                  ?.keywords.map((keyword, index) => (
                    <Badge key={index} variant="outline">
                      {keyword}
                    </Badge>
                  ))}
              </div>
            </ContentSection>
          )}
        </>
      ) : (
        <ContentSection>
          <div className="flex flex-col items-center justify-center py-12">
            <p className="text-muted-foreground">{EVENTS_TEXT.trends.empty.description}</p>
          </div>
        </ContentSection>
      )}

      {/* Domain Overview */}
      <ContentSection title={EVENTS_TEXT.trends.overview.title}>
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {domains.map((domain) => (
            <div
              key={domain.id}
              className={`p-4 rounded-lg border cursor-pointer hover:shadow-md transition-shadow ${
                selectedDomain === domain.code ? 'border-primary bg-primary/5' : ''
              }`}
              onClick={() => handleDomainChange(domain.code)}
            >
              <div className="mb-2">
                <h3 className="font-medium">{domain.name}</h3>
              </div>
              <p className="text-sm text-muted-foreground line-clamp-2">
                {domain.description || '暂无描述'}
              </p>
              <div className="flex flex-wrap gap-1 mt-2">
                {domain.keywords.slice(0, 3).map((keyword, index) => (
                  <Badge key={index} variant="secondary" className="text-xs">
                    {keyword}
                  </Badge>
                ))}
                {domain.keywords.length > 3 && (
                  <Badge variant="secondary" className="text-xs">
                    +{domain.keywords.length - 3}
                  </Badge>
                )}
              </div>
            </div>
          ))}
        </div>
      </ContentSection>
    </EventPageLayout>
  )
}
