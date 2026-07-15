'use client'

import { useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { Separator } from '@/components/ui/separator'
import {
  Brain,
  Send,
  Loader2,
  TrendingUp,
  TrendingDown,
  Minus,
  Building2,
  Layers,
  Package,
  Users,
  Clock,
  Zap,
  AlertCircle,
  CheckCircle2,
} from 'lucide-react'

interface EventAnalysisResponse {
  category: string
  sentiment: {
    score: number
    confidence: number
    label: string
  }
  impact: {
    timeHorizon: string
    magnitude: number
    affectedSectors: Array<{
      sector: string
      direction: 'positive' | 'negative'
      weight: number
    }>
    reasoning: string
  }
  entities: {
    companies: string[]
    sectors: string[]
    products: string[]
    people: string[]
  }
  summary: string
}

const categoryLabels: Record<string, string> = {
  policy: '政策法规',
  earnings: '财报业绩',
  product: '产品发布',
  partnership: '合作并购',
  supply: '供应链',
  tech: '技术突破',
  regulation: '监管制裁',
  market: '市场动态',
}

const sentimentLabels: Record<string, { label: string; color: string; icon: typeof TrendingUp }> = {
  very_bullish: { label: '强烈利好', color: 'bg-green-100 text-green-700', icon: TrendingUp },
  bullish: { label: '利好', color: 'bg-green-50 text-green-600', icon: TrendingUp },
  neutral: { label: '中性', color: 'bg-gray-100 text-gray-600', icon: Minus },
  bearish: { label: '利空', color: 'bg-red-50 text-red-600', icon: TrendingDown },
  very_bearish: { label: '强烈利空', color: 'bg-red-100 text-red-700', icon: TrendingDown },
}

const timeHorizonLabels: Record<string, string> = {
  short: '短期（1-3天）',
  medium: '中期（1-4周）',
  long: '长期（1-3月）',
}

export default function EventsAnalysisPage() {
  const [title, setTitle] = useState('')
  const [content, setContent] = useState('')
  const [source, setSource] = useState('')
  const [isAnalyzing, setIsAnalyzing] = useState(false)
  const [analysis, setAnalysis] = useState<EventAnalysisResponse | null>(null)
  const [error, setError] = useState<string | null>(null)

  const handleAnalyze = async () => {
    if (!title.trim()) {
      setError('请输入新闻标题')
      return
    }

    setIsAnalyzing(true)
    setError(null)
    setAnalysis(null)

    try {
      const response = await fetch('/api/events/analyze', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          title: title.trim(),
          content: content.trim(),
          source: source.trim() || '手动输入',
          publishTime: new Date().toISOString(),
        }),
      })

      const data = await response.json()

      if (data.success && data.data) {
        setAnalysis(data.data)
      } else {
        setError(data.error || '分析失败，请稍后重试')
      }
    } catch (err) {
      setError('网络请求失败，请检查网络连接')
      console.error('分析请求失败:', err)
    } finally {
      setIsAnalyzing(false)
    }
  }

  const getSentimentInfo = (label: string) => {
    return sentimentLabels[label] || sentimentLabels.neutral
  }

  const getMagnitudeLabel = (magnitude: number) => {
    if (magnitude >= 5) return '极高'
    if (magnitude >= 4) return '高'
    if (magnitude >= 3) return '中等'
    if (magnitude >= 2) return '低'
    return '极低'
  }

  const getMagnitudeColor = (magnitude: number) => {
    if (magnitude >= 4) return 'text-red-600'
    if (magnitude >= 3) return 'text-orange-600'
    return 'text-yellow-600'
  }

  return (
    <div className="space-y-6">
      {/* 页面标题 */}
      <div>
        <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2">
          <Brain className="h-8 w-8 text-primary" />
          事件AI分析
        </h1>
        <p className="text-muted-foreground mt-1">
          输入新闻内容，使用Claude AI进行智能分析，识别事件分类、情感倾向、影响范围和关键实体
        </p>
      </div>

      <Separator />

      {/* 输入区域 */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">新闻输入</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="title">新闻标题 *</Label>
            <Input
              id="title"
              placeholder="请输入新闻标题"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="content">新闻内容</Label>
            <Textarea
              id="content"
              placeholder="请输入新闻详细内容（可选，内容越详细分析越准确）"
              value={content}
              onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setContent(e.target.value)}
              rows={6}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="source">新闻来源</Label>
            <Input
              id="source"
              placeholder="请输入新闻来源（如：新华社、财联社等）"
              value={source}
              onChange={(e) => setSource(e.target.value)}
            />
          </div>

          {error && (
            <div className="flex items-center gap-2 text-destructive text-sm">
              <AlertCircle className="h-4 w-4" />
              {error}
            </div>
          )}

          <Button
            onClick={handleAnalyze}
            disabled={isAnalyzing || !title.trim()}
            className="w-full"
          >
            {isAnalyzing ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                分析中...
              </>
            ) : (
              <>
                <Send className="mr-2 h-4 w-4" />
                开始分析
              </>
            )}
          </Button>
        </CardContent>
      </Card>

      {/* 分析结果 */}
      {analysis && (
        <div className="space-y-6">
          <div className="flex items-center gap-2 text-green-600">
            <CheckCircle2 className="h-5 w-5" />
            <span className="font-medium">分析完成</span>
          </div>

          {/* 摘要 */}
          <Card className="border-primary/20 bg-primary/5">
            <CardContent className="pt-6">
              <div className="flex items-start gap-3">
                <Brain className="h-5 w-5 text-primary mt-0.5" />
                <div>
                  <h3 className="font-semibold mb-2">AI摘要</h3>
                  <p className="text-muted-foreground">{analysis.summary}</p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* 分类和情感 */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* 事件分类 */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                  <Layers className="h-4 w-4" />
                  事件分类
                </CardTitle>
              </CardHeader>
              <CardContent>
                <Badge variant="default" className="text-lg px-4 py-1">
                  {categoryLabels[analysis.category] || analysis.category}
                </Badge>
              </CardContent>
            </Card>

            {/* 情感分析 */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                  <Zap className="h-4 w-4" />
                  情感分析
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {(() => {
                  const sentimentInfo = getSentimentInfo(analysis.sentiment.label)
                  const SentimentIcon = sentimentInfo.icon
                  return (
                    <div className="flex items-center gap-3">
                      <div className={`p-2 rounded-full ${sentimentInfo.color}`}>
                        <SentimentIcon className="h-5 w-5" />
                      </div>
                      <div>
                        <div className="font-semibold text-lg">{sentimentInfo.label}</div>
                        <div className="text-sm text-muted-foreground">
                          分数: {(analysis.sentiment.score * 100).toFixed(0)}% | 置信度: {(analysis.sentiment.confidence * 100).toFixed(0)}%
                        </div>
                      </div>
                    </div>
                  )
                })()}
              </CardContent>
            </Card>
          </div>

          {/* 影响评估 */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                <TrendingUp className="h-4 w-4" />
                影响评估
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="flex items-center gap-3">
                  <Clock className="h-5 w-5 text-muted-foreground" />
                  <div>
                    <div className="text-sm text-muted-foreground">影响时间跨度</div>
                    <div className="font-medium">
                      {timeHorizonLabels[analysis.impact.timeHorizon] || analysis.impact.timeHorizon}
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  <Zap className="h-5 w-5 text-muted-foreground" />
                  <div>
                    <div className="text-sm text-muted-foreground">影响力度</div>
                    <div className={`font-medium ${getMagnitudeColor(analysis.impact.magnitude)}`}>
                      {getMagnitudeLabel(analysis.impact.magnitude)} ({analysis.impact.magnitude}/5)
                    </div>
                  </div>
                </div>
              </div>

              {analysis.impact.affectedSectors.length > 0 && (
                <div>
                  <div className="text-sm text-muted-foreground mb-2">受影响板块</div>
                  <div className="flex flex-wrap gap-2">
                    {analysis.impact.affectedSectors.map((sector, index) => (
                      <Badge
                        key={index}
                        variant={sector.direction === 'positive' ? 'default' : 'destructive'}
                        className="flex items-center gap-1"
                      >
                        {sector.direction === 'positive' ? (
                          <TrendingUp className="h-3 w-3" />
                        ) : (
                          <TrendingDown className="h-3 w-3" />
                        )}
                        {sector.sector}
                        <span className="text-xs opacity-75">
                          ({(sector.weight * 100).toFixed(0)}%)
                        </span>
                      </Badge>
                    ))}
                  </div>
                </div>
              )}

              {analysis.impact.reasoning && (
                <div>
                  <div className="text-sm text-muted-foreground mb-2">推理过程</div>
                  <p className="text-sm bg-muted p-3 rounded-md">{analysis.impact.reasoning}</p>
                </div>
              )}
            </CardContent>
          </Card>

          {/* 实体识别 */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                <Package className="h-4 w-4" />
                实体识别
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* 公司 */}
                {analysis.entities.companies.length > 0 && (
                  <div>
                    <div className="flex items-center gap-2 text-sm font-medium mb-2">
                      <Building2 className="h-4 w-4" />
                      公司
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {analysis.entities.companies.map((company, index) => (
                        <Badge key={index} variant="secondary">
                          {company}
                        </Badge>
                      ))}
                    </div>
                  </div>
                )}

                {/* 板块 */}
                {analysis.entities.sectors.length > 0 && (
                  <div>
                    <div className="flex items-center gap-2 text-sm font-medium mb-2">
                      <Layers className="h-4 w-4" />
                      板块
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {analysis.entities.sectors.map((sector, index) => (
                        <Badge key={index} variant="outline">
                          {sector}
                        </Badge>
                      ))}
                    </div>
                  </div>
                )}

                {/* 产品 */}
                {analysis.entities.products.length > 0 && (
                  <div>
                    <div className="flex items-center gap-2 text-sm font-medium mb-2">
                      <Package className="h-4 w-4" />
                      产品
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {analysis.entities.products.map((product, index) => (
                        <Badge key={index} variant="secondary">
                          {product}
                        </Badge>
                      ))}
                    </div>
                  </div>
                )}

                {/* 人物 */}
                {analysis.entities.people.length > 0 && (
                  <div>
                    <div className="flex items-center gap-2 text-sm font-medium mb-2">
                      <Users className="h-4 w-4" />
                      人物
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {analysis.entities.people.map((person, index) => (
                        <Badge key={index} variant="outline">
                          {person}
                        </Badge>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  )
}
