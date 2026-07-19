'use client'

import { useEffect, useState } from 'react'
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
import { CheckCircle, XCircle, Clock, RefreshCw } from 'lucide-react'

interface FetchLog {
  id: string
  sourceId: string
  sourceName: string
  sourceType: string
  status: string
  message: string | null
  fetchedCount: number
  processedCount: number
  failedCount: number
  duration: number | null
  errorDetail: string | null
  createdAt: string
}

interface FetchLogsProps {
  sourceId?: string
  autoRefresh?: boolean
  refreshInterval?: number
}

export function FetchLogs({ sourceId, autoRefresh = false, refreshInterval = 30000 }: FetchLogsProps) {
  const [logs, setLogs] = useState<FetchLog[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [statusFilter, setStatusFilter] = useState<string>('all')

  useEffect(() => {
    fetchLogs()

    if (autoRefresh) {
      const interval = setInterval(fetchLogs, refreshInterval)
      return () => clearInterval(interval)
    }
  }, [sourceId, statusFilter, autoRefresh, refreshInterval])

  const fetchLogs = async () => {
    try {
      let url = '/api/logs/fetch?limit=20'
      if (sourceId) url += `&sourceId=${sourceId}`
      if (statusFilter !== 'all') url += `&status=${statusFilter}`

      const response = await fetch(url)
      const data = await response.json()

      if (data.success) {
        setLogs(data.data)
        setTotal(data.total)
      }
    } catch (error) {
      console.error('获取采集日志失败:', error)
    } finally {
      setLoading(false)
    }
  }

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'success':
        return <CheckCircle className="h-4 w-4 text-green-600" />
      case 'failed':
        return <XCircle className="h-4 w-4 text-red-600" />
      case 'running':
        return <Clock className="h-4 w-4 text-blue-600" />
      default:
        return <Clock className="h-4 w-4 text-muted-foreground" />
    }
  }

  const getStatusBadge = (status: string) => {
    const variants: Record<string, 'default' | 'secondary' | 'destructive' | 'outline'> = {
      success: 'default',
      failed: 'destructive',
      running: 'secondary'
    }

    const labels: Record<string, string> = {
      success: '成功',
      failed: '失败',
      running: '进行中'
    }

    return (
      <Badge variant={variants[status] || 'outline'}>
        {labels[status] || status}
      </Badge>
    )
  }

  const formatDuration = (ms: number | null) => {
    if (!ms) return '-'
    if (ms < 1000) return `${ms}ms`
    return `${(ms / 1000).toFixed(1)}s`
  }

  const formatTime = (dateString: string) => {
    const date = new Date(dateString)
    const now = new Date()
    const diffMs = now.getTime() - date.getTime()
    const diffMins = Math.floor(diffMs / 60000)

    if (diffMins < 1) return '刚刚'
    if (diffMins < 60) return `${diffMins}分钟前`
    if (diffMins < 1440) return `${Math.floor(diffMins / 60)}小时前`

    return date.toLocaleString('zh-CN', {
      month: 'numeric',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    })
  }

  if (loading) {
    return (
      <Card>
        <CardContent className="p-6">
          <div className="space-y-3">
            {[...Array(5)].map((_, i) => (
              <div key={i} className="h-16 bg-muted animate-pulse rounded" />
            ))}
          </div>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-base">采集日志</CardTitle>
            <p className="text-sm text-muted-foreground mt-1">
              共 {total} 条记录
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Select value={statusFilter} onValueChange={(value) => setStatusFilter(value || 'all')}>
              <SelectTrigger className="w-32">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">全部</SelectItem>
                <SelectItem value="success">成功</SelectItem>
                <SelectItem value="failed">失败</SelectItem>
                <SelectItem value="running">进行中</SelectItem>
              </SelectContent>
            </Select>
            <Button variant="outline" size="sm" onClick={fetchLogs}>
              <RefreshCw className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {logs.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            暂无采集日志
          </div>
        ) : (
          <div className="space-y-3">
            {logs.map((log) => (
              <div
                key={log.id}
                className="border rounded-lg p-4 hover:bg-muted/50 transition-colors"
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="flex items-start gap-3 flex-1">
                    <div className="mt-0.5">{getStatusIcon(log.status)}</div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="font-medium">{log.sourceName}</span>
                        <Badge variant="outline" className="text-xs">
                          {log.sourceType}
                        </Badge>
                        {getStatusBadge(log.status)}
                      </div>
                      <p className="text-sm text-muted-foreground mb-2">
                        {log.message || '无消息'}
                      </p>
                      {log.status === 'success' && (
                        <div className="flex items-center gap-4 text-xs text-muted-foreground">
                          <span>采集: {log.fetchedCount}</span>
                          <span>处理: {log.processedCount}</span>
                          {log.failedCount > 0 && (
                            <span className="text-red-600">失败: {log.failedCount}</span>
                          )}
                          <span>耗时: {formatDuration(log.duration)}</span>
                        </div>
                      )}
                      {log.errorDetail && (
                        <div className="mt-2 p-2 bg-red-50 dark:bg-red-950/20 rounded text-xs text-red-600 dark:text-red-400">
                          {log.errorDetail}
                        </div>
                      )}
                    </div>
                  </div>
                  <div className="text-xs text-muted-foreground whitespace-nowrap">
                    {formatTime(log.createdAt)}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
