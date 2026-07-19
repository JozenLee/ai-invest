'use client'

import { useState, useEffect } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Database,
  RefreshCw,
  Clock,
  Play,
  Pause,
  Settings,
  Activity,
  Newspaper,
  Globe,
} from 'lucide-react'
import { PageHeader } from '@/components/events/PageHeader'
import { StatCardGrid } from '@/components/events/StatCardGrid'
import { StatCard } from '@/components/events/StatCard'
import { ContentSection } from '@/components/events/ContentSection'
import { ErrorState } from '@/components/events/ErrorState'
import { StatusBadge } from '@/components/events/StatusBadge'
import { EVENTS_TEXT } from '@/constants/events-text'

interface DataSource {
  id: string
  name: string
  description?: string
  category: string
  provider: string
  website?: string
  updateFrequency: string
  coverage?: string[]
  dataQuality?: string
  status: string
}

interface SchedulerStatus {
  status?: string
  is_running: boolean
  jobs: Array<{
    id: string
    func: string
    interval?: number
    cron?: string
    next_run: string
    status: string
  }>
}

const categoryIcons: Record<string, React.ReactNode> = {
  '综合财经媒体': <Newspaper className="h-5 w-5" />,
  '行业专业媒体': <Database className="h-5 w-5" />,
  '政策与监管': <Settings className="h-5 w-5" />,
  '国际视角': <Globe className="h-5 w-5" />,
}

const categoryLabels: Record<string, string> = {
  '综合财经媒体': '综合财经媒体',
  '行业专业媒体': '行业专业媒体',
  '政策与监管': '政策与监管',
  '国际视角': '国际视角',
}

export default function DataSourcesPage() {
  const [dataSources, setDataSources] = useState<DataSource[]>([])
  const [schedulerStatus, setSchedulerStatus] = useState<SchedulerStatus | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [isSchedulerOffline, setIsSchedulerOffline] = useState(false)
  const [categoryFilter, setCategoryFilter] = useState<string>('all')

  // 获取数据源列表
  const fetchDataSources = async () => {
    try {
      const response = await fetch('/api/datasources')
      if (response.ok) {
        const data = await response.json()
        if (data.success) {
          setDataSources(data.data.sources || [])
        }
      }
    } catch (error) {
      console.error('获取数据源失败:', error)
    }
  }

  // 获取调度器状态
  const fetchSchedulerStatus = async () => {
    try {
      const response = await fetch('/api/events/scheduler/status')
      if (response.ok) {
        const data = await response.json()
        if (data.status === 'offline') {
          setIsSchedulerOffline(true)
          setSchedulerStatus(null)
        } else {
          setIsSchedulerOffline(false)
          setSchedulerStatus(data)
        }
      } else {
        setIsSchedulerOffline(true)
        setSchedulerStatus(null)
      }
    } catch (error) {
      console.error('获取调度器状态失败:', error)
      setIsSchedulerOffline(true)
      setSchedulerStatus(null)
    }
  }

  // 刷新所有数据
  const refreshAll = async () => {
    setIsLoading(true)
    await Promise.all([fetchDataSources(), fetchSchedulerStatus()])
    setIsLoading(false)
  }

  useEffect(() => {
    refreshAll()
  }, [])

  // 手动触发采集
  const handleManualFetch = async (sourceId: string) => {
    try {
      const response = await fetch('/api/events/scheduler/fetch', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ source_id: sourceId }),
      })

      if (response.ok) {
        const data = await response.json()
        if (data.status === 'offline') {
          alert(EVENTS_TEXT.sources.error.description)
        } else {
          alert(EVENTS_TEXT.sources.actions.fetchSuccess)
          refreshAll()
        }
      } else {
        alert(EVENTS_TEXT.sources.actions.fetchFailed)
      }
    } catch (error) {
      console.error('触发采集失败:', error)
      alert(EVENTS_TEXT.sources.actions.fetchFailed)
    }
  }

  // 暂停/恢复调度器
  const handleToggleScheduler = async () => {
    try {
      const response = await fetch('/api/events/scheduler/toggle', {
        method: 'POST',
      })

      if (response.ok) {
        const data = await response.json()
        if (data.status === 'offline') {
          alert(EVENTS_TEXT.sources.error.description)
        } else {
          refreshAll()
        }
      } else {
        alert(EVENTS_TEXT.sources.actions.toggleFailed)
      }
    } catch (error) {
      console.error('切换调度器状态失败:', error)
      alert(EVENTS_TEXT.sources.actions.toggleFailed)
    }
  }

  const formatTime = (timeStr?: string) => {
    if (!timeStr) return EVENTS_TEXT.time.never
    try {
      const date = new Date(timeStr)
      const now = new Date()
      const diff = now.getTime() - date.getTime()
      const hours = Math.floor(diff / (1000 * 60 * 60))
      const minutes = Math.floor(diff / (1000 * 60))

      if (hours > 24) {
        return `${Math.floor(hours / 24)}${EVENTS_TEXT.time.daysAgo}`
      } else if (hours > 0) {
        return `${hours}${EVENTS_TEXT.time.hoursAgo}`
      } else if (minutes > 0) {
        return `${minutes}${EVENTS_TEXT.time.minutesAgo}`
      } else {
        return EVENTS_TEXT.time.justNow
      }
    } catch {
      return timeStr
    }
  }

  const filteredSources = categoryFilter === 'all'
    ? dataSources
    : dataSources.filter((s) => s.category === categoryFilter)

  // 计算统计数据
  const activeSources = dataSources.filter((s) => s.status === 'active').length
  const inactiveSources = dataSources.filter((s) => s.status === 'inactive').length

  return (
    <div className="space-y-6">
      {/* 第一段：页面标题 */}
      <PageHeader
        title={EVENTS_TEXT.sources.title}
        description={EVENTS_TEXT.sources.description}
        actions={
          <Button variant="outline" size="sm" onClick={refreshAll} disabled={isLoading}>
            <RefreshCw className={`mr-2 h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
            {EVENTS_TEXT.common.refresh}
          </Button>
        }
      />

      {/* 第二段：数据概览 */}
      <StatCardGrid>
        <StatCard
          icon={Database}
          label={EVENTS_TEXT.sources.stats.totalSources}
          value={dataSources.length}
        />
        <StatCard
          icon={Activity}
          label={EVENTS_TEXT.sources.stats.activeSources}
          value={activeSources}
          variant="success"
        />
        <StatCard
          icon={Clock}
          label={EVENTS_TEXT.sources.stats.inactiveSources}
          value={inactiveSources}
          variant="default"
        />
        <StatCard
          icon={RefreshCw}
          label={EVENTS_TEXT.sources.stats.lastFetch}
          value={formatTime(schedulerStatus?.jobs?.[0]?.next_run)}
        />
      </StatCardGrid>

      {/* 调度器离线错误提示 */}
      {isSchedulerOffline && (
        <ErrorState
          type="offline"
          title={EVENTS_TEXT.sources.error.title}
          description={EVENTS_TEXT.sources.error.description}
          fallbackMode={true}
          fallbackMessage={EVENTS_TEXT.sources.error.suggestion}
          onRetry={refreshAll}
          showRetry={true}
        />
      )}

      {/* 调度器状态 */}
      <ContentSection
        title={EVENTS_TEXT.sources.scheduler.title}
        actions={
          !isSchedulerOffline && (
            <Button
              variant={schedulerStatus?.is_running ? 'destructive' : 'default'}
              size="sm"
              onClick={handleToggleScheduler}
              disabled={isSchedulerOffline}
            >
              {schedulerStatus?.is_running ? (
                <>
                  <Pause className="mr-2 h-4 w-4" />
                  {EVENTS_TEXT.sources.scheduler.stopScheduler}
                </>
              ) : (
                <>
                  <Play className="mr-2 h-4 w-4" />
                  {EVENTS_TEXT.sources.scheduler.startScheduler}
                </>
              )}
            </Button>
          )
        }
      >
        {!isSchedulerOffline ? (
          <>
            <div className="flex items-center gap-4 mb-4">
              <StatusBadge
                status={schedulerStatus?.is_running ? 'running' : 'stopped'}
              />
              <Badge variant="outline">
                {schedulerStatus?.jobs?.length || 0} {EVENTS_TEXT.units.count}任务
              </Badge>
            </div>

            {/* 任务列表 */}
            {schedulerStatus?.jobs && schedulerStatus.jobs.length > 0 && (
              <div className="space-y-2">
                {schedulerStatus.jobs.map((job) => (
                  <div
                    key={job.id}
                    className="flex items-center justify-between p-3 bg-muted rounded-lg"
                  >
                    <div>
                      <p className="font-medium">{job.id}</p>
                      <p className="text-xs text-muted-foreground">
                        {job.interval ? `每 ${job.interval} 分钟` : job.cron}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge variant={job.status === 'active' ? 'default' : 'secondary'}>
                        {job.status === 'active' ? EVENTS_TEXT.status.active : EVENTS_TEXT.status.inactive}
                      </Badge>
                      <span className="text-xs text-muted-foreground">
                        {EVENTS_TEXT.sources.scheduler.nextRun}: {new Date(job.next_run).toLocaleString('zh-CN')}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </>
        ) : (
          <div className="text-center py-8 text-muted-foreground">
            {EVENTS_TEXT.sources.error.description}
          </div>
        )}
      </ContentSection>

      {/* 第三段：数据源列表 */}
      <div className="space-y-4">
        {/* 筛选器 */}
        <div className="flex items-center gap-4">
          <span className="text-sm font-medium">数据源类型：</span>
          <Select value={categoryFilter} onValueChange={(value) => setCategoryFilter(value ?? 'all')}>
            <SelectTrigger className="w-[180px]">
              <SelectValue placeholder={`${EVENTS_TEXT.common.all}类型`}>
                {categoryFilter === 'all' ? `${EVENTS_TEXT.common.all}类型` :
                 categoryFilter === '综合财经媒体' ? '综合财经媒体' :
                 categoryFilter === '行业专业媒体' ? '行业专业媒体' :
                 categoryFilter === '政策与监管' ? '政策与监管' :
                 categoryFilter === '国际视角' ? '国际视角' :
                 `${EVENTS_TEXT.common.all}类型`}
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{EVENTS_TEXT.common.all}类型</SelectItem>
              <SelectItem value="综合财经媒体">综合财经媒体</SelectItem>
              <SelectItem value="行业专业媒体">行业专业媒体</SelectItem>
              <SelectItem value="政策与监管">政策与监管</SelectItem>
              <SelectItem value="国际视角">国际视角</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* 数据源卡片 */}
        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <RefreshCw className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        ) : filteredSources.length === 0 ? (
          <Card>
            <CardContent className="flex items-center justify-center py-12">
              <p className="text-muted-foreground">{EVENTS_TEXT.sources.empty.title}</p>
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {filteredSources.map((source) => (
              <Card key={source.id} className="hover:shadow-md transition-shadow">
                <CardHeader className="pb-3">
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-2">
                      <div className="p-2 rounded-lg bg-muted">
                        {categoryIcons[source.category] || <Database className="h-5 w-5" />}
                      </div>
                      <div>
                        <CardTitle className="text-base">{source.name}</CardTitle>
                        <p className="text-xs text-muted-foreground">{source.provider}</p>
                      </div>
                    </div>
                    <Badge variant={source.status === 'active' ? 'default' : 'secondary'}>
                      {source.status === 'active' ? EVENTS_TEXT.status.enabled : EVENTS_TEXT.status.disabled}
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="flex items-center gap-2">
                    <Badge variant="outline">{categoryLabels[source.category] || source.category}</Badge>
                    <Badge variant="secondary">
                      <Clock className="h-3 w-3 mr-1" />
                      {source.updateFrequency}
                    </Badge>
                  </div>

                  {source.description && (
                    <p className="text-sm text-muted-foreground line-clamp-2">
                      {source.description}
                    </p>
                  )}

                  {source.coverage && source.coverage.length > 0 && (
                    <div className="flex flex-wrap gap-1">
                      {source.coverage.slice(0, 3).map((item, index) => (
                        <Badge key={index} variant="secondary" className="text-xs">
                          {item}
                        </Badge>
                      ))}
                      {source.coverage.length > 3 && (
                        <Badge variant="secondary" className="text-xs">
                          +{source.coverage.length - 3}
                        </Badge>
                      )}
                    </div>
                  )}

                  <div className="flex gap-2 pt-2 border-t">
                    <Button
                      variant="outline"
                      size="sm"
                      className="flex-1"
                      onClick={() => handleManualFetch(source.id)}
                      disabled={isSchedulerOffline}
                    >
                      <RefreshCw className="mr-2 h-4 w-4" />
                      {EVENTS_TEXT.sources.scheduler.manualFetch}
                    </Button>
                    <Button variant="outline" size="sm" disabled>
                      <Settings className="h-4 w-4" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>

      {/* 说明卡片 */}
      <Card className="bg-muted/50">
        <CardContent className="p-6">
          <div className="flex items-start gap-3">
            <Database className="h-5 w-5 text-muted-foreground mt-0.5" />
            <div className="space-y-2">
              <h3 className="font-semibold">关于数据源</h3>
              <ul className="text-sm text-muted-foreground space-y-1">
                <li>• <strong>财经媒体</strong>: 财联社、东方财富等主流财经网站</li>
                <li>• <strong>社交媒体</strong>: 微博、小红书等社交平台</li>
                <li>• <strong>视频平台</strong>: B站等视频内容平台</li>
                <li>• <strong>自定义</strong>: RSS订阅、自定义API等</li>
                <li>• 定时任务每小时自动采集最新资讯</li>
                <li>• 采集的数据会自动更新到资讯流和趋势分析页面</li>
              </ul>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
