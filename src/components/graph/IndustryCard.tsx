'use client'

import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Calendar, Clock, Network, Eye, Settings, RefreshCw } from 'lucide-react'
import { SwimLaneThumbnail } from './SwimLaneThumbnail'

interface Industry {
  id: string
  name: string
  description?: string
  createdAt: string
  updatedAt: string
  nodeCount?: number
  status?: string
}

interface IndustryCardProps {
  industry: Industry
  onViewDetail: (id: string) => void
  onScheduleConfig: (industry: Industry) => void
  onMoreActions?: (industry: Industry) => void
}

export function IndustryCard({
  industry,
  onViewDetail,
  onScheduleConfig,
  onMoreActions
}: IndustryCardProps) {
  const formatDate = (dateString: string) => {
    try {
      return new Date(dateString).toLocaleDateString('zh-CN', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit'
      })
    } catch {
      return dateString
    }
  }

  return (
    <Card className="hover:shadow-lg transition-shadow">
      <CardContent className="p-6">
        <div className="flex gap-6">
          {/* 左侧：产业信息 */}
          <div className="flex-1 space-y-4">
            {/* 标题和状态 */}
            <div className="space-y-2">
              <div className="flex items-start justify-between">
                <h3 className="text-2xl font-bold text-slate-900">{industry.name}</h3>
                {industry.status && (
                  <Badge
                    variant={industry.status === 'completed' ? 'default' : 'secondary'}
                    className="ml-2"
                  >
                    {industry.status === 'completed' ? '已完成' : '进行中'}
                  </Badge>
                )}
              </div>
              {industry.description && (
                <p className="text-sm text-muted-foreground line-clamp-2">
                  {industry.description}
                </p>
              )}
            </div>

            {/* 元数据 */}
            <div className="grid grid-cols-2 gap-3">
              <div className="flex items-center gap-2 text-sm text-slate-600">
                <Calendar className="h-4 w-4 text-slate-400" />
                <div>
                  <div className="text-xs text-slate-500">创建时间</div>
                  <div className="font-medium">{formatDate(industry.createdAt)}</div>
                </div>
              </div>

              <div className="flex items-center gap-2 text-sm text-slate-600">
                <RefreshCw className="h-4 w-4 text-slate-400" />
                <div>
                  <div className="text-xs text-slate-500">更新时间</div>
                  <div className="font-medium">{formatDate(industry.updatedAt)}</div>
                </div>
              </div>

              {industry.nodeCount !== undefined && (
                <div className="flex items-center gap-2 text-sm text-slate-600">
                  <Network className="h-4 w-4 text-slate-400" />
                  <div>
                    <div className="text-xs text-slate-500">节点数量</div>
                    <div className="font-medium">{industry.nodeCount} 个</div>
                  </div>
                </div>
              )}
            </div>

            {/* 操作按钮 */}
            <div className="flex items-center gap-2 pt-2">
              <Button
                onClick={() => onViewDetail(industry.id)}
                className="flex-1"
              >
                <Eye className="mr-2 h-4 w-4" />
                查看详情
              </Button>
              <Button
                variant="outline"
                onClick={() => onScheduleConfig(industry)}
                title="配置定时更新"
              >
                <Clock className="h-4 w-4" />
              </Button>
              {onMoreActions && (
                <Button
                  variant="ghost"
                  onClick={() => onMoreActions(industry)}
                  title="更多操作"
                >
                  <Settings className="h-4 w-4" />
                </Button>
              )}
            </div>
          </div>

          {/* 右侧：泳道图缩略图 */}
          <div className="w-96">
            <SwimLaneThumbnail
              industryId={industry.id}
              className="h-full min-h-[200px]"
            />
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
