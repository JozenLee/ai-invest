'use client'

import { useState, useEffect } from 'react'
import { Card, CardContent } from '@/components/ui/card'
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
  Activity,
} from 'lucide-react'
import { PageHeader } from '@/components/events/PageHeader'
import { StatCardGrid } from '@/components/events/StatCardGrid'
import { StatCard } from '@/components/events/StatCard'
import { DataSourceCard } from '@/components/events/DataSourceCard'
import { SchedulerDrawer } from '@/components/events/SchedulerDrawer'
import { EVENTS_TEXT } from '@/constants/events-text'

interface DataSource {
  id: string
  name: string
  category: string
  categoryLabel: string
  type: string
  typeLabel: string
  driverType: string
  driverTypeLabel: string
  isActive: boolean
  statusLabel: string
  updateFrequency: number
  lastFetchAt?: string
  lastFetchStatus?: string
  lastFetchStatusLabel?: string
  scheduler?: {
    id: string
    scheduleType: string
    scheduleTypeLabel: string
    scheduleConfig: Record<string, any>
    isEnabled: boolean
    lastRunAt?: string
    nextRunAt?: string
  } | null
}

export default function DataSourcesPage() {
  const [dataSources, setDataSources] = useState<DataSource[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [categoryFilter, setCategoryFilter] = useState<string>('all')
  const [selectedSource, setSelectedSource] = useState<DataSource | null>(null)
  const [isDrawerOpen, setIsDrawerOpen] = useState(false)

  // 获取数据源列表
  const fetchDataSources = async () => {
    try {
      const response = await fetch('/api/datasources')
      if (response.ok) {
        const data = await response.json()
        if (data.success) {
          setDataSources(data.data || [])
        }
      }
    } catch (error) {
      console.error('获取数据源失败:', error)
    }
  }

  // 刷新数据
  const refreshAll = async () => {
    setIsLoading(true)
    await fetchDataSources()
    setIsLoading(false)
  }

  useEffect(() => {
    refreshAll()
  }, [])

  // 切换数据源启用/禁用状态
  const handleToggle = async (id: string, isActive: boolean) => {
    try {
      const response = await fetch(`/api/datasources/${id}/toggle`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ isActive }),
      })

      if (response.ok) {
        const data = await response.json()
        if (data.success) {
          // 刷新数据源列表
          await fetchDataSources()
        } else {
          alert(data.message || '操作失败')
        }
      } else {
        alert('操作失败')
      }
    } catch (error) {
      console.error('切换数据源状态失败:', error)
      alert('操作失败')
    }
  }

  // 立即采集
  const handleFetch = async (id: string) => {
    try {
      const response = await fetch(`/api/datasources/${id}/fetch`, {
        method: 'POST',
      })

      if (response.ok) {
        const data = await response.json()
        if (data.success) {
          alert('采集任务已触发')
          await fetchDataSources()
        } else {
          alert(data.error || '操作失败')
        }
      } else {
        const data = await response.json()
        alert(data.error || '操作失败')
      }
    } catch (error) {
      console.error('触发采集失败:', error)
      alert('操作失败，请确保数据服务已启动')
    }
  }

  // 打开调度器设置
  const handleSettings = (id: string) => {
    const source = dataSources.find(ds => ds.id === id)
    if (source) {
      setSelectedSource(source)
      setIsDrawerOpen(true)
    }
  }

  // 调度器设置更新后的回调
  const handleDrawerUpdate = async () => {
    await fetchDataSources()
  }

  // 按类别筛选
  const filteredSources = categoryFilter === 'all'
    ? dataSources
    : dataSources.filter((s) => s.category === categoryFilter)

  // 计算统计数据
  const activeSources = dataSources.filter((s) => s.isActive).length
  const inactiveSources = dataSources.filter((s) => !s.isActive).length

  // 获取最近采集时间
  const getLatestFetchTime = () => {
    const times = dataSources
      .map(ds => ds.lastFetchAt)
      .filter(Boolean) as string[]

    if (times.length === 0) return '从未运行'

    const latest = new Date(Math.max(...times.map(t => new Date(t).getTime())))
    const now = new Date()
    const diff = now.getTime() - latest.getTime()

    if (diff < 60 * 1000) return '刚刚'
    if (diff < 60 * 60 * 1000) return `${Math.floor(diff / (60 * 1000))}分钟前`
    if (diff < 24 * 60 * 60 * 1000) return `${Math.floor(diff / (60 * 60 * 1000))}小时前`

    return latest.toLocaleDateString('zh-CN', {
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit'
    })
  }

  return (
    <div className="space-y-6">
      {/* 页面标题 */}
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

      {/* 数据概览 */}
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
          value={getLatestFetchTime()}
        />
      </StatCardGrid>

      {/* 数据源列表 */}
      <div className="space-y-4">
        {/* 筛选器 */}
        <div className="flex items-center gap-4">
          <span className="text-sm font-medium">数据源类别：</span>
          <Select value={categoryFilter} onValueChange={(value) => setCategoryFilter(value ?? 'all')}>
            <SelectTrigger className="w-[180px]">
              <SelectValue placeholder={`${EVENTS_TEXT.common.all}类别`} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{EVENTS_TEXT.common.all}类别</SelectItem>
              <SelectItem value="综合财经媒体">综合财经媒体</SelectItem>
              <SelectItem value="科技媒体">科技媒体</SelectItem>
              <SelectItem value="社交媒体">社交媒体</SelectItem>
              <SelectItem value="视频平台">视频平台</SelectItem>
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
              <DataSourceCard
                key={source.id}
                dataSource={source}
                onToggle={handleToggle}
                onFetch={handleFetch}
                onSettings={handleSettings}
              />
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
                <li>• <strong>综合财经媒体</strong>: 财联社、东方财富等主流财经网站</li>
                <li>• <strong>科技媒体</strong>: 36氪、钛媒体等科技资讯平台</li>
                <li>• <strong>社交媒体</strong>: 微博、小红书等社交平台</li>
                <li>• <strong>视频平台</strong>: B站等视频内容平台</li>
                <li>• 定时任务按配置自动采集最新资讯</li>
                <li>• 采集的数据会自动更新到资讯流和趋势分析页面</li>
              </ul>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* 调度器设置抽屉 */}
      {selectedSource && (
        <SchedulerDrawer
          open={isDrawerOpen}
          onOpenChange={setIsDrawerOpen}
          dataSource={selectedSource}
          onUpdate={handleDrawerUpdate}
        />
      )}
    </div>
  )
}
