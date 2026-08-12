'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
import { Sparkles, Loader2, CheckCircle2, XCircle, AlertCircle, TrendingUp, BarChart3 } from 'lucide-react'
import { toast } from 'sonner'

interface IndustryMatchButtonProps {
  industryId: string
  industryName: string
  onMatchComplete?: (results?: MatchDetail[]) => void
}

interface MatchDetail {
  nodeId: string
  nodeName: string
  etfCount: number
  indexCount: number
  success: boolean
  error?: string
  etfs?: Array<{
    code: string
    name: string
    relevance: number
    reasoning: string
  }>
  indices?: Array<{
    code: string
    name: string
    relevance: number
    reasoning: string
  }>
}

export function IndustryMatchButton({
  industryId,
  industryName,
  onMatchComplete,
}: IndustryMatchButtonProps) {
  const [isDialogOpen, setIsDialogOpen] = useState(false)
  const [isMatching, setIsMatching] = useState(false)
  const [progress, setProgress] = useState(0)
  const [result, setResult] = useState<{
    matched: number
    failed: number
    details: MatchDetail[]
  } | null>(null)

  const handleMatch = async () => {
    setIsMatching(true)
    setProgress(0)
    setResult(null)

    try {
      const response = await fetch('/api/graph/match-etf-index', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          scope: 'industry',
          targetId: industryId,
          options: {
            matchETF: true,
            matchIndex: false,
            topN: 5,
            minRelevance: 0.6,
          },
        }),
      })

      const data = await response.json()

      if (response.ok && data.success) {
        setResult(data.data)
        toast.success(`匹配完成！成功 ${data.data.matched} 个节点`)
        onMatchComplete?.(data.data.details)
      } else {
        toast.error(data.error || '匹配失败')
      }
    } catch (error) {
      console.error('匹配失败:', error)
      toast.error('匹配失败，请重试')
    } finally {
      setIsMatching(false)
      setProgress(100)
    }
  }

  return (
    <>
      <Button
        size="sm"
        variant="outline"
        onClick={() => setIsDialogOpen(true)}
        className="gap-2"
      >
        <Sparkles className="h-4 w-4" />
        匹配ETF
      </Button>

      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>智能匹配ETF</DialogTitle>
            <DialogDescription>
              为 <strong>{industryName}</strong> 的所有节点自动匹配相关的ETF
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            {!result && !isMatching && (
              <div className="space-y-3">
                <p className="text-sm text-muted-foreground">
                  系统将使用AI分析每个节点的特征，自动匹配最相关的ETF。
                </p>
                <div className="bg-muted p-3 rounded-lg space-y-2 text-sm">
                  <div className="flex items-start gap-2">
                    <AlertCircle className="h-4 w-4 mt-0.5 text-primary shrink-0" />
                    <div>
                      <p className="font-medium">匹配策略</p>
                      <ul className="list-disc list-inside text-muted-foreground mt-1 space-y-1">
                        <li>关键词初筛：快速过滤候选ETF</li>
                        <li>AI精准分析：评估相关度和权重</li>
                        <li>保留Top 5：每个节点最多5个ETF</li>
                        <li>结果会显示在各节点卡片上</li>
                      </ul>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {isMatching && (
              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <Loader2 className="h-5 w-5 animate-spin text-primary" />
                  <span className="text-sm font-medium">正在匹配...</span>
                </div>
                <Progress value={progress} className="h-2" />
                <p className="text-xs text-muted-foreground">
                  请耐心等待，匹配过程可能需要1-2分钟
                </p>
              </div>
            )}

            {result && (
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-3">
                  <div className="bg-green-50 dark:bg-green-950/20 p-3 rounded-lg">
                    <div className="flex items-center gap-2 text-green-700 dark:text-green-400">
                      <CheckCircle2 className="h-5 w-5" />
                      <span className="text-sm font-medium">成功匹配</span>
                    </div>
                    <p className="text-2xl font-bold text-green-700 dark:text-green-400 mt-1">
                      {result.matched}
                    </p>
                  </div>
                  {result.failed > 0 && (
                    <div className="bg-red-50 dark:bg-red-950/20 p-3 rounded-lg">
                      <div className="flex items-center gap-2 text-red-700 dark:text-red-400">
                        <XCircle className="h-5 w-5" />
                        <span className="text-sm font-medium">匹配失败</span>
                      </div>
                      <p className="text-2xl font-bold text-red-700 dark:text-red-400 mt-1">
                        {result.failed}
                      </p>
                    </div>
                  )}
                </div>

                <div className="space-y-2 max-h-96 overflow-y-auto">
                  <p className="text-sm font-medium">详细结果</p>
                  {result.details.map((detail) => (
                    <div
                      key={detail.nodeId}
                      className={`p-3 rounded-lg text-sm ${
                        detail.success
                          ? 'bg-muted'
                          : 'bg-red-50 dark:bg-red-950/20'
                      }`}
                    >
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-2 flex-1 min-w-0">
                          {detail.success ? (
                            <CheckCircle2 className="h-4 w-4 text-green-600 shrink-0" />
                          ) : (
                            <XCircle className="h-4 w-4 text-red-600 shrink-0" />
                          )}
                          <span className="font-medium truncate">{detail.nodeName}</span>
                        </div>
                        {detail.success && (
                          <div className="flex items-center gap-2 shrink-0">
                            {detail.etfCount > 0 && (
                              <Badge variant="secondary" className="text-xs gap-1">
                                <TrendingUp className="h-3 w-3" />
                                {detail.etfCount} ETF
                              </Badge>
                            )}
                            {detail.indexCount > 0 && (
                              <Badge variant="secondary" className="text-xs gap-1">
                                <BarChart3 className="h-3 w-3" />
                                {detail.indexCount} 指数
                              </Badge>
                            )}
                          </div>
                        )}
                        {!detail.success && detail.error && (
                          <span className="text-xs text-red-600 ml-2">
                            {detail.error}
                          </span>
                        )}
                      </div>

                      {/* 显示匹配到的ETF */}
                      {detail.success && detail.etfs && detail.etfs.length > 0 && (
                        <div className="ml-6 mt-2 space-y-1">
                          {detail.etfs.slice(0, 3).map((etf) => (
                            <div key={etf.code} className="flex items-center gap-2 text-xs">
                              <Badge variant="outline" className="font-mono">
                                {etf.code}
                              </Badge>
                              <span className="text-muted-foreground truncate">
                                {etf.name}
                              </span>
                              <span className="text-xs text-muted-foreground ml-auto">
                                {(etf.relevance * 100).toFixed(0)}%
                              </span>
                            </div>
                          ))}
                          {detail.etfs.length > 3 && (
                            <p className="text-xs text-muted-foreground">
                              +{detail.etfs.length - 3} 更多
                            </p>
                          )}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          <DialogFooter>
            {!result && !isMatching && (
              <>
                <Button variant="outline" onClick={() => setIsDialogOpen(false)}>
                  取消
                </Button>
                <Button onClick={handleMatch}>
                  <Sparkles className="mr-2 h-4 w-4" />
                  开始匹配
                </Button>
              </>
            )}
            {result && (
              <Button onClick={() => setIsDialogOpen(false)}>
                关闭
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
