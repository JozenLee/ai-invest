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
import { SchedulerDialog } from '@/components/events/SchedulerDialog'
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
  const [statusFilter, setStatusFilter] = useState<string>('all') // 新增：状态筛选
  const [selectedSource, setSelectedSource] = useState<DataSource | null>(null)
  const [isDialogOpen, setIsDialogOpen] = useState(false)

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
      setIsDialogOpen(true)
    }
  }

  // 调度器设置更新后的回调
  const handleDialogUpdate = async () => {
    await fetchDataSources()
  }

  // 按类别和状态筛选
  const filteredSources = dataSources
    .filter((s) => categoryFilter === 'all' || s.category === categoryFilter)
    .filter((s) => statusFilter === 'all' || (statusFilter === 'active' ? s.isActive : !s.isActive))

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
        <div className="flex items-center gap-4 flex-wrap">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium">类别：</span>
            <Select value={categoryFilter} onValueChange={(value) => setCategoryFilter(value ?? 'all')}>
              <SelectTrigger className="w-[180px]">
                <SelectValue>
                  {categoryFilter === 'all' ? '全部类别' : categoryFilter}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">全部类别</SelectItem>
                <SelectItem value="综合财经媒体">综合财经媒体</SelectItem>
                <SelectItem value="AI行业资讯">AI行业资讯</SelectItem>
                <SelectItem value="半导体行业">半导体行业</SelectItem>
                <SelectItem value="科技创投媒体">科技创投媒体</SelectItem>
                <SelectItem value="社交媒体">社交媒体</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-sm font-medium">状态：</span>
            <Select value={statusFilter} onValueChange={(value) => setStatusFilter(value ?? 'all')}>
              <SelectTrigger className="w-[140px]">
                <SelectValue>
                  {statusFilter === 'all' ? '全部状态' : statusFilter === 'active' ? '仅激活' : '仅禁用'}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">全部状态</SelectItem>
                <SelectItem value="active">仅激活 ({activeSources})</SelectItem>
                <SelectItem value="inactive">仅禁用 ({inactiveSources})</SelectItem>
              </SelectContent>
            </Select>
          </div>
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
                <li>• <strong>NewsNow 热榜聚合</strong>: 华尔街见闻、财联社、澎湃财经、36氪等主流财经平台热榜</li>
                <li>• <strong>AKShare 财经数据</strong>: 财联社资讯、AI资讯、芯片资讯、财新网等专业财经内容</li>
                <li>• <strong>社交媒体</strong>: 雪球等投资社区的实时讨论和观点</li>
                <li>• 系统优先使用 NewsNow 数据源，自动降级到 AKShare 和雪球</li>
                <li>• 定时任务按配置自动采集最新资讯（30-180分钟不等）</li>
                <li>• 采集的数据会经过 AI 分类和情感分析，自动更新到资讯流</li>
                <li>• 灰色数据源已禁用但数据保留，可随时重新激活</li>
              </ul>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* 调度器设置对话框 */}
      {selectedSource && (
        <SchedulerDialog
          open={isDialogOpen}
          onOpenChange={setIsDialogOpen}
          dataSource={selectedSource}
          onUpdate={handleDialogUpdate}
        />
      )}
    </div>
  )
}
