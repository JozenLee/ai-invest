'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import {
  Network,
  Plus,
  RefreshCw,
  Loader2,
  Settings,
  Clock,
} from 'lucide-react'
import { IndustryThumbnail } from '@/components/graph/IndustryThumbnail'
import { ScheduleConfigDialog } from '@/components/graph/ScheduleConfigDialog'
import type { Industry } from '@/types/industry-graph'

export default function GraphPage() {
  const router = useRouter()
  const [industries, setIndustries] = useState<Industry[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [scheduleDialogOpen, setScheduleDialogOpen] = useState(false)
  const [selectedIndustry, setSelectedIndustry] = useState<Industry | null>(null)

  // 获取产业列表
  const fetchIndustries = async () => {
    setIsLoading(true)
    try {
      const response = await fetch('/api/graph/industries')
      const result = await response.json()
      if (result.success && result.data) {
        setIndustries(Array.isArray(result.data) ? result.data : [])
      }
    } catch (error) {
      console.error('获取产业列表失败:', error)
      setIndustries([])
    } finally {
      setIsLoading(false)
    }
  }

  // 删除产业的处理函数（带乐观更新）
  const handleDelete = async (deletedId: string) => {
    // 乐观更新：立即从UI中移除
    setIndustries(prev => prev.filter(ind => ind.id !== deletedId))
    // 然后刷新以同步后端状态
    await fetchIndustries()
  }

  useEffect(() => {
    fetchIndustries()
  }, [])

  const handleScheduleConfig = (industry: Industry) => {
    setSelectedIndustry(industry)
    setScheduleDialogOpen(true)
  }

  const handleThumbnailClick = (industryId: string) => {
    router.push(`/graph/industries/${industryId}`)
  }

  return (
    <div className="space-y-6">
      {/* 页面标题和操作区 */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">知识图谱</h1>
          <p className="text-muted-foreground mt-1">
            AI驱动的产业链结构和企业关系探索
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={fetchIndustries}
            disabled={isLoading}
          >
            <RefreshCw className={`mr-2 h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
            刷新
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              setSelectedIndustry(null)
              setScheduleDialogOpen(true)
            }}
            title="全局定时配置"
          >
            <Settings className="mr-2 h-4 w-4" />
            定时配置
          </Button>
          <Button
            size="sm"
            onClick={() => router.push('/graph/create')}
          >
            <Plus className="mr-2 h-4 w-4" />
            新增图谱
          </Button>
        </div>
      </div>

      {/* 产业列表 */}
      {isLoading ? (
        <Card>
          <CardContent className="py-12">
            <div className="flex flex-col items-center justify-center text-muted-foreground">
              <Loader2 className="h-8 w-8 animate-spin mb-4" />
              <p>加载中...</p>
            </div>
          </CardContent>
        </Card>
      ) : industries.length === 0 ? (
        <Card>
          <CardContent className="py-12">
            <div className="flex flex-col items-center justify-center text-muted-foreground">
              <Network className="h-12 w-12 mb-4" />
              <p className="text-lg mb-2">暂无产业图谱</p>
              <p className="text-sm mb-4">创建第一个产业图谱，开始AI驱动的产业链探索</p>
              <Button onClick={() => router.push('/graph/create')}>
                <Plus className="mr-2 h-4 w-4" />
                新增图谱
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : (
        // 网格视图（缩略图）
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {industries.map((industry) => (
            <IndustryThumbnail
              key={industry.id}
              industry={industry}
              mode="simple"
              onClick={() => handleThumbnailClick(industry.id)}
              onDelete={() => handleDelete(industry.id)}
            />
          ))}
        </div>
      )}

      {/* 定时配置对话框 */}
      <ScheduleConfigDialog
        open={scheduleDialogOpen}
        onOpenChange={setScheduleDialogOpen}
        industryName={selectedIndustry?.name}
        industryId={selectedIndustry?.id}
      />
    </div>
  )
}
