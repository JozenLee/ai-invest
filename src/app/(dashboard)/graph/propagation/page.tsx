'use client'

import { useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  GitBranch,
  ArrowRight,
  TrendingUp,
  TrendingDown,
  Clock,
  Target,
  RefreshCw,
} from 'lucide-react'

interface PropagationPath {
  nodes: string[]
  edges: any[]
  totalLag: string
  finalImpact: {
    node: string
    direction: string
    magnitude: number
    confidence: number
  }
  explanation: string
}

interface AffectedStock {
  ticker: string
  name: string
  impactDirection: string
  impactReasoning: string
  timeHorizon: string
}

const presetEvents = [
  'NVIDIA发布新GPU，AI芯片需求增长',
  'HBM供不应求，存储芯片涨价',
  'AI服务器出货量大增',
  '光模块速率升级，800G放量',
  '液冷技术普及，散热需求增加',
  '出口管制政策收紧',
]

export default function PropagationPage() {
  const [event, setEvent] = useState('')
  const [paths, setPaths] = useState<PropagationPath[]>([])
  const [affectedStocks, setAffectedStocks] = useState<AffectedStock[]>([])
  const [isAnalyzing, setIsAnalyzing] = useState(false)
  const [triggerEvent, setTriggerEvent] = useState('')

  const analyzePropagation = async () => {
    if (!event.trim()) return

    setIsAnalyzing(true)
    setTriggerEvent(event)

    try {
      const response = await fetch('/api/graph/propagation', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ event })
      })

      if (response.ok) {
        const data = await response.json()
        if (data.success && data.data) {
          setPaths(data.data.paths || [])
          setAffectedStocks(data.data.affectedStocks || [])
        }
      }
    } catch (error) {
      console.error('传导路径分析失败:', error)
    } finally {
      setIsAnalyzing(false)
    }
  }

  const getMagnitudeStars = (magnitude: number) => {
    return '★'.repeat(magnitude) + '☆'.repeat(5 - magnitude)
  }

  return (
    <div className="space-y-6">
      {/* 页面标题 */}
      <div>
        <h1 className="text-3xl font-bold tracking-tight">传导路径分析</h1>
        <p className="text-muted-foreground">
          分析事件在AI硬件产业链中的传导路径
        </p>
      </div>

      {/* 事件输入 */}
      <Card>
        <CardHeader>
          <CardTitle>输入触发事件</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div className="flex gap-2">
              <input
                type="text"
                placeholder="输入事件描述，如：NVIDIA发布新GPU，AI芯片需求增长"
                className="flex-1 px-4 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
                value={event}
                onChange={(e) => setEvent(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && analyzePropagation()}
              />
              <Button onClick={analyzePropagation} disabled={isAnalyzing || !event.trim()}>
                {isAnalyzing ? (
                  <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Target className="mr-2 h-4 w-4" />
                )}
                分析
              </Button>
            </div>

            {/* 预设事件 */}
            <div>
              <p className="text-sm text-muted-foreground mb-2">快速选择：</p>
              <div className="flex flex-wrap gap-2">
                {presetEvents.map((preset) => (
                  <Button
                    key={preset}
                    variant="outline"
                    size="sm"
                    onClick={() => setEvent(preset)}
                  >
                    {preset}
                  </Button>
                ))}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* 分析结果 */}
      {triggerEvent && (
        <div className="space-y-6">
          {/* 触发事件 */}
          <Card>
            <CardContent className="p-6">
              <div className="flex items-center gap-3">
                <div className="p-3 bg-primary/10 rounded-full">
                  <GitBranch className="h-6 w-6 text-primary" />
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">触发事件</p>
                  <p className="font-semibold text-lg">{triggerEvent}</p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* 传导路径 */}
          {paths.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <ArrowRight className="h-5 w-5" />
                  传导路径
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {paths.map((path, index) => (
                    <div key={index} className="p-4 border rounded-lg">
                      <div className="flex items-center justify-between mb-3">
                        <div className="flex items-center gap-2">
                          <Badge variant="default">路径 {index + 1}</Badge>
                          <Badge variant="outline">
                            <Clock className="mr-1 h-3 w-3" />
                            {path.totalLag}
                          </Badge>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-sm text-muted-foreground">影响力:</span>
                          <span className="text-yellow-500">{getMagnitudeStars(path.finalImpact.magnitude)}</span>
                          <span className="text-sm text-muted-foreground">置信度:</span>
                          <span className="text-sm font-medium">{(path.finalImpact.confidence * 100).toFixed(0)}%</span>
                        </div>
                      </div>

                      {/* 路径可视化 */}
                      <div className="flex items-center flex-wrap gap-2 mb-3">
                        {path.nodes.map((node, i) => (
                          <div key={i} className="flex items-center gap-2">
                            <Badge variant={i === 0 ? 'default' : i === path.nodes.length - 1 ? 'destructive' : 'secondary'}>
                              {node}
                            </Badge>
                            {i < path.nodes.length - 1 && (
                              <ArrowRight className="h-4 w-4 text-muted-foreground" />
                            )}
                          </div>
                        ))}
                      </div>

                      <p className="text-sm text-muted-foreground">
                        {path.explanation}
                      </p>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {/* 受影响个股 */}
          {affectedStocks.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <TrendingUp className="h-5 w-5" />
                  受影响个股（仅供参考）
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid gap-4 md:grid-cols-2">
                  {affectedStocks.map((stock) => (
                    <div key={stock.ticker} className="p-4 border rounded-lg">
                      <div className="flex items-center justify-between mb-2">
                        <div>
                          <span className="font-semibold">{stock.name}</span>
                          <span className="text-sm text-muted-foreground ml-2">{stock.ticker}</span>
                        </div>
                        <Badge variant={stock.impactDirection === 'positive' ? 'default' : 'destructive'}>
                          {stock.impactDirection === 'positive' ? '利好' : '利空'}
                        </Badge>
                      </div>
                      <p className="text-sm text-muted-foreground mb-2">{stock.impactReasoning}</p>
                      <div className="flex items-center gap-2">
                        <Clock className="h-3 w-3 text-muted-foreground" />
                        <span className="text-xs text-muted-foreground">{stock.timeHorizon}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {/* 无结果提示 */}
          {paths.length === 0 && !isAnalyzing && (
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-12">
                <GitBranch className="h-12 w-12 text-muted-foreground mb-4" />
                <p className="text-muted-foreground">未找到传导路径，请尝试其他事件描述</p>
              </CardContent>
            </Card>
          )}
        </div>
      )}

      {/* 使用说明 */}
      {!triggerEvent && (
        <Card>
          <CardHeader>
            <CardTitle>使用说明</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div>
                <h4 className="font-medium mb-2">什么是传导路径分析？</h4>
                <p className="text-sm text-muted-foreground">
                  传导路径分析基于AI硬件产业链知识图谱，分析一个事件如何通过产业链关系影响其他环节。
                  例如：NVIDIA发布新GPU → AI芯片需求增长 → HBM需求增加 → 存储芯片涨价。
                </p>
              </div>
              <div>
                <h4 className="font-medium mb-2">如何使用？</h4>
                <ol className="list-decimal list-inside text-sm text-muted-foreground space-y-1">
                  <li>输入或选择一个触发事件</li>
                  <li>系统自动分析事件在产业链中的传导路径</li>
                  <li>查看每条路径的影响力度、置信度和传导时间</li>
                  <li>了解受影响的相关个股（仅供参考）</li>
                </ol>
              </div>
              <div>
                <h4 className="font-medium mb-2">示例事件</h4>
                <ul className="list-disc list-inside text-sm text-muted-foreground space-y-1">
                  <li>NVIDIA发布新GPU，AI芯片需求增长</li>
                  <li>HBM供不应求，存储芯片涨价</li>
                  <li>AI服务器出货量大增</li>
                  <li>出口管制政策收紧</li>
                </ul>
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
