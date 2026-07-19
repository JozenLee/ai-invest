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
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Separator } from '@/components/ui/separator'
import {
  History,
  RefreshCw,
  Plus,
  Pencil,
  Trash,
  GitBranch,
  ArrowRight,
  Clock,
  Filter,
  SortAsc,
  SortDesc,
} from 'lucide-react'

interface GraphChangeLog {
  id: string
  nodeId?: string
  edgeId?: string
  action: string
  before?: string
  after?: string
  reason?: string
  source: string
  approved: boolean
  approvedBy?: string
  createdAt: string
  node?: {
    id: string
    name: string
    type: string
  }
}

const actionLabels: Record<string, { label: string; icon: typeof Plus; color: string }> = {
  add_node: { label: '添加节点', icon: Plus, color: 'bg-green-100 text-green-700' },
  update_node: { label: '更新节点', icon: Pencil, color: 'bg-blue-100 text-blue-700' },
  delete_node: { label: '删除节点', icon: Trash, color: 'bg-red-100 text-red-700' },
  add_edge: { label: '添加关系', icon: GitBranch, color: 'bg-green-100 text-green-700' },
  update_edge: { label: '更新关系', icon: GitBranch, color: 'bg-blue-100 text-blue-700' },
  delete_edge: { label: '删除关系', icon: GitBranch, color: 'bg-red-100 text-red-700' },
}

const actionApiMap: Record<string, string> = {
  '添加节点': 'add_node',
  '更新节点': 'update_node',
  '删除节点': 'delete_node',
  '添加关系': 'add_edge',
  '更新关系': 'update_edge',
  '删除关系': 'delete_edge',
}

const sourceLabels: Record<string, string> = {
  manual: '手动操作',
  ai_suggested: 'AI建议',
  data_driven: '数据驱动',
}

export default function GraphChangelogPage() {
  const [logs, setLogs] = useState<GraphChangeLog[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [actionFilter, setActionFilter] = useState<string>('all')
  const [sortOrder, setSortOrder] = useState<'desc' | 'asc'>('desc')

  const fetchChangelog = async () => {
    setIsLoading(true)
    try {
      const response = await fetch('/api/graph/changelog?limit=100')
      if (response.ok) {
        const data = await response.json()
        if (data.success && data.data) {
          setLogs(data.data)
        }
      }
    } catch (error) {
      console.error('获取变更日志失败:', error)
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    fetchChangelog()
  }, [])

  const formatTime = (timeStr: string) => {
    try {
      const date = new Date(timeStr)
      return date.toLocaleString('zh-CN', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
      })
    } catch {
      return timeStr
    }
  }

  const getRelativeTime = (timeStr: string) => {
    try {
      const date = new Date(timeStr)
      const now = new Date()
      const diff = now.getTime() - date.getTime()
      const minutes = Math.floor(diff / (1000 * 60))
      const hours = Math.floor(diff / (1000 * 60 * 60))
      const days = Math.floor(diff / (1000 * 60 * 60 * 24))

      if (days > 0) {
        return `${days}天前`
      } else if (hours > 0) {
        return `${hours}小时前`
      } else if (minutes > 0) {
        return `${minutes}分钟前`
      } else {
        return '刚刚'
      }
    } catch {
      return ''
    }
  }

  const getActionInfo = (action: string) => {
    return actionLabels[action] || { label: action, icon: Pencil, color: 'bg-gray-100 text-gray-700' }
  }

  const filteredLogs = logs.filter(log => {
    if (actionFilter === 'all') return true
    return log.action === (actionApiMap[actionFilter] || actionFilter)
  })

  const sortedLogs = [...filteredLogs].sort((a, b) => {
    const dateA = new Date(a.createdAt).getTime()
    const dateB = new Date(b.createdAt).getTime()
    return sortOrder === 'desc' ? dateB - dateA : dateA - dateB
  })

  const toggleSortOrder = () => {
    setSortOrder(prev => prev === 'desc' ? 'asc' : 'desc')
  }

  return (
    <div className="space-y-6">
      {/* 页面标题 */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2">
            <History className="h-8 w-8 text-primary" />
            变更历史
          </h1>
          <p className="text-muted-foreground mt-1">
            知识图谱的变更记录，包括节点和关系的增删改操作
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={fetchChangelog}
          disabled={isLoading}
        >
          <RefreshCw className={`mr-2 h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
          刷新
        </Button>
      </div>

      <Separator />

      {/* 筛选和排序 */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4">
            <div className="flex items-center gap-2">
              <Filter className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm font-medium">操作类型：</span>
              <Select value={actionFilter} onValueChange={(value) => setActionFilter(value || 'all')}>
                <SelectTrigger className="w-[180px]">
                  <SelectValue placeholder="筛选操作类型" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">全部操作</SelectItem>
                  <SelectItem value="添加节点">添加节点</SelectItem>
                  <SelectItem value="更新节点">更新节点</SelectItem>
                  <SelectItem value="删除节点">删除节点</SelectItem>
                  <SelectItem value="添加关系">添加关系</SelectItem>
                  <SelectItem value="更新关系">更新关系</SelectItem>
                  <SelectItem value="删除关系">删除关系</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="flex items-center gap-2">
              <Clock className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm font-medium">时间排序：</span>
              <Button
                variant="outline"
                size="sm"
                onClick={toggleSortOrder}
              >
                {sortOrder === 'desc' ? (
                  <>
                    <SortDesc className="mr-2 h-4 w-4" />
                    最新在前
                  </>
                ) : (
                  <>
                    <SortAsc className="mr-2 h-4 w-4" />
                    最早在前
                  </>
                )}
              </Button>
            </div>

            <div className="ml-auto text-sm text-muted-foreground">
              共 {sortedLogs.length} 条记录
            </div>
          </div>
        </CardContent>
      </Card>

      {/* 变更日志表格 */}
      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <RefreshCw className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : sortedLogs.length === 0 ? (
            <div className="flex items-center justify-center py-12">
              <p className="text-muted-foreground">暂无变更记录</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[100px]">操作类型</TableHead>
                  <TableHead>节点/关系</TableHead>
                  <TableHead>变更原因</TableHead>
                  <TableHead>来源</TableHead>
                  <TableHead>状态</TableHead>
                  <TableHead className="text-right">时间</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sortedLogs.map((log) => {
                  const actionInfo = getActionInfo(log.action)
                  const ActionIcon = actionInfo.icon

                  return (
                    <TableRow key={log.id}>
                      <TableCell>
                        <Badge className={actionInfo.color} variant="secondary">
                          <ActionIcon className="h-3 w-3 mr-1" />
                          {actionInfo.label}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <div className="font-medium">
                          {log.node?.name || log.nodeId || log.edgeId || '-'}
                        </div>
                        {log.node?.type && (
                          <div className="text-xs text-muted-foreground">
                            类型: {log.node.type}
                          </div>
                        )}
                      </TableCell>
                      <TableCell>
                        <div className="max-w-[300px] truncate text-sm">
                          {log.reason || '-'}
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline">
                          {sourceLabels[log.source] || log.source}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        {log.approved ? (
                          <Badge variant="default" className="bg-green-100 text-green-700">
                            已审核
                          </Badge>
                        ) : (
                          <Badge variant="secondary">
                            待审核
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="text-sm" title={formatTime(log.createdAt)}>
                          {getRelativeTime(log.createdAt)}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          {formatTime(log.createdAt)}
                        </div>
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* 变更详情 */}
      {sortedLogs.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <ArrowRight className="h-5 w-5" />
              操作说明
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
              {Object.entries(actionLabels).map(([key, { label, color }]) => (
                <div key={key} className="flex items-center gap-2">
                  <Badge className={color} variant="secondary">
                    {label}
                  </Badge>
                  <span className="text-sm text-muted-foreground">
                    {key.includes('node') ? '节点' : '关系'}操作
                  </span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
