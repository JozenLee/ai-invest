'use client'

import { useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  Brain,
  TrendingUp,
  TrendingDown,
  Minus,
  RefreshCw,
  AlertTriangle,
  CheckCircle,
  Clock,
  Target,
} from 'lucide-react'

interface InvestmentScore {
  ticker: string
  name: string
  trackingIndex: string
  dimensions: {
    technical: { score: number; weight: number; details: string[] }
    capitalFlow: { score: number; weight: number; details: string[] }
    sentiment: { score: number; weight: number; details: string[] }
    event: { score: number; weight: number; details: string[] }
    graph: { score: number; weight: number; details: string[] }
    etfQuality: { score: number; weight: number; details: string[] }
    valuation: { score: number; weight: number; details: string[] }
  }
  compositeScore: number
  rating: 'strong_buy' | 'buy' | 'hold' | 'reduce' | 'sell'
  confidence: number
}

interface AIReport {
  marketOverview: {
    overallSentiment: string
    keyObservations: string[]
    riskLevel: string
    capitalFlowSummary: string
  }
  etfRecommendations: Array<{
    ticker: string
    name: string
    action: string
    conviction: number
    positionSize: string
    reasoning: string
    catalysts: string[]
    risks: string[]
    timeHorizon: string
  }>
  fullReport: string
}

const etfPool = [
  { ticker: '510300', name: '沪深300ETF' },
  { ticker: '512480', name: '半导体ETF' },
  { ticker: '588000', name: '科创50ETF' },
  { ticker: '515880', name: '通信ETF' },
  { ticker: '159853', name: '光通信ETF' },
]

const ratingLabels: Record<string, string> = {
  strong_buy: '强烈买入',
  buy: '买入',
  hold: '持有',
  reduce: '减持',
  sell: '卖出',
}

const ratingColors: Record<string, string> = {
  strong_buy: 'text-green-600 bg-green-100',
  buy: 'text-green-600 bg-green-100',
  hold: 'text-yellow-600 bg-yellow-100',
  reduce: 'text-orange-600 bg-orange-100',
  sell: 'text-red-600 bg-red-100',
}

interface GraphPerspectiveAnalysis {
  coverage: {
    totalNodes: number
    coveredNodes: number
    coverageRate: number
    uncoveredLevels: string[]
  }
  cycleRisk: {
    upturn: number
    peak: number
    downturn: number
    trough: number
    neutral: number
    riskScore: number
  }
  supplyChainBalance: {
    upstream: number
    midstream: number
    downstream: number
    isBalanced: boolean
  }
  momentum: {
    weightedAverage: number
    distribution: {
      high: number
      medium: number
      low: number
    }
  }
  insights: string[]
}

export default function AnalysisStockPage() {
  const [selectedETF, setSelectedETF] = useState('512480')
  const [score, setScore] = useState<InvestmentScore | null>(null)
  const [aiReport, setAIReport] = useState<AIReport | null>(null)
  const [graphAnalysis, setGraphAnalysis] = useState<GraphPerspectiveAnalysis | null>(null)
  const [isAnalyzing, setIsAnalyzing] = useState(false)
  const [userQuestion, setUserQuestion] = useState('')

  const analyzeETF = async () => {
    setIsAnalyzing(true)

    try {
      // 基础分析
      const response = await fetch('/api/analysis/etf', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ticker: selectedETF,
          includeGraph: true,
          includeEvents: true,
          userQuestion: userQuestion || undefined,
        })
      })

      if (response.ok) {
        const data = await response.json()
        if (data.success && data.data) {
          setScore(data.data.score)
          setAIReport(data.data.aiReport)
        }
      }

      // 图谱分析
      try {
        const graphResponse = await fetch(`/api/etf/${selectedETF}/graph-analysis`)
        if (graphResponse.ok) {
          const graphResult = await graphResponse.json()
          if (graphResult.success) {
            setGraphAnalysis(graphResult.data)
          }
        }
      } catch (error) {
        console.error('图谱分析失败:', error)
      }
    } catch (error) {
      console.error('分析失败:', error)
    } finally {
      setIsAnalyzing(false)
    }
  }

  const getScoreColor = (score: number) => {
    if (score >= 70) return 'text-green-600'
    if (score >= 50) return 'text-yellow-600'
    return 'text-red-600'
  }

  const getScoreBar = (score: number) => {
    const color = score >= 70 ? 'bg-green-500' : score >= 50 ? 'bg-yellow-500' : 'bg-red-500'
    return (
      <div className="h-2 w-full rounded-full bg-secondary">
        <div
          className={`h-2 rounded-full ${color}`}
          style={{ width: `${score}%` }}
        />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* 页面标题 */}
      <div>
        <h1 className="text-3xl font-bold tracking-tight">ETF分析</h1>
        <p className="text-muted-foreground">
          AI驱动的ETF多因子综合分析
        </p>
      </div>

      {/* ETF选择 */}
      <Card>
        <CardHeader>
          <CardTitle>选择ETF</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-2 mb-4">
            {etfPool.map(etf => (
              <Button
                key={etf.ticker}
                variant={selectedETF === etf.ticker ? 'default' : 'outline'}
                onClick={() => setSelectedETF(etf.ticker)}
              >
                {etf.name}
              </Button>
            ))}
          </div>

          <div className="flex gap-2">
            <input
              type="text"
              placeholder="输入您的问题（可选），如：当前是否适合加仓？"
              className="flex-1 px-4 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
              value={userQuestion}
              onChange={(e) => setUserQuestion(e.target.value)}
            />
            <Button onClick={analyzeETF} disabled={isAnalyzing}>
              {isAnalyzing ? (
                <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Brain className="mr-2 h-4 w-4" />
              )}
              AI分析
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* 分析结果 */}
      {score && (
        <Tabs defaultValue="basic" className="space-y-6">
          <TabsList>
            <TabsTrigger value="basic">基础分析</TabsTrigger>
            <TabsTrigger value="graph">图谱视角</TabsTrigger>
          </TabsList>

          <TabsContent value="basic">
            <div className="grid gap-6 lg:grid-cols-3">{/* 左侧：评分详情 */}
          <div className="lg:col-span-2 space-y-6">
            {/* 综合评分 */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center justify-between">
                  <span>综合评分</span>
                  <Badge className={ratingColors[score.rating]}>
                    {ratingLabels[score.rating]}
                  </Badge>
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex items-center gap-6">
                  <div className="text-center">
                    <p className={`text-5xl font-bold ${getScoreColor(score.compositeScore)}`}>
                      {score.compositeScore}
                    </p>
                    <p className="text-sm text-muted-foreground">/100</p>
                  </div>
                  <div className="flex-1 space-y-2">
                    <div className="flex items-center justify-between text-sm">
                      <span>置信度</span>
                      <span>{(score.confidence * 100).toFixed(0)}%</span>
                    </div>
                    <div className="h-2 w-full rounded-full bg-secondary">
                      <div
                        className="h-2 rounded-full bg-primary"
                        style={{ width: `${score.confidence * 100}%` }}
                      />
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* 各维度评分 */}
            <Card>
              <CardHeader>
                <CardTitle>评分维度</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {Object.entries(score.dimensions).map(([key, dim]) => {
                    const labels: Record<string, string> = {
                      technical: '技术面',
                      capitalFlow: '资金面',
                      sentiment: '情绪面',
                      event: '事件面',
                      graph: '产业链',
                      etfQuality: 'ETF质量',
                      valuation: '估值面',
                    }

                    return (
                      <div key={key}>
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-sm font-medium">{labels[key] || key}</span>
                          <span className={`text-sm font-bold ${getScoreColor(dim.score)}`}>
                            {dim.score}
                          </span>
                        </div>
                        {getScoreBar(dim.score)}
                        <div className="flex flex-wrap gap-1 mt-1">
                          {dim.details.map((detail, i) => (
                            <Badge key={i} variant="outline" className="text-xs">
                              {detail}
                            </Badge>
                          ))}
                        </div>
                      </div>
                    )
                  })}
                </div>
              </CardContent>
            </Card>

            {/* AI报告 */}
            {aiReport && (
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Brain className="h-5 w-5" />
                    AI分析报告
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="prose prose-sm max-w-none">
                    <div dangerouslySetInnerHTML={{ __html: aiReport.fullReport.replace(/\n/g, '<br/>') }} />
                  </div>
                </CardContent>
              </Card>
            )}
          </div>

          {/* 右侧：投资建议 */}
          <div className="space-y-6">
            {/* 操作建议 */}
            {aiReport?.etfRecommendations?.[0] && (
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Target className="h-5 w-5" />
                    投资建议
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    <div className="text-center p-4 bg-muted rounded-lg">
                      <p className="text-sm text-muted-foreground mb-1">操作建议</p>
                      <p className="text-2xl font-bold">
                        {aiReport.etfRecommendations[0].action === 'buy' ? '买入' :
                         aiReport.etfRecommendations[0].action === 'hold' ? '持有' : '卖出'}
                      </p>
                    </div>

                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-sm text-muted-foreground">建议仓位</span>
                        <span className="text-sm font-medium">{aiReport.etfRecommendations[0].positionSize}</span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-sm text-muted-foreground">持有周期</span>
                        <span className="text-sm font-medium">{aiReport.etfRecommendations[0].timeHorizon}</span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-sm text-muted-foreground">信心度</span>
                        <div className="flex gap-1">
                          {Array.from({ length: 5 }).map((_, i) => (
                            <div
                              key={i}
                              className={`w-4 h-4 rounded-full ${
                                i < aiReport.etfRecommendations[0].conviction
                                  ? 'bg-primary'
                                  : 'bg-secondary'
                              }`}
                            />
                          ))}
                        </div>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* 催化剂 */}
            {aiReport?.etfRecommendations?.[0]?.catalysts && (
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <CheckCircle className="h-5 w-5 text-green-500" />
                    潜在催化剂
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <ul className="space-y-2">
                    {aiReport.etfRecommendations[0].catalysts.map((catalyst, i) => (
                      <li key={i} className="flex items-start gap-2">
                        <CheckCircle className="h-4 w-4 text-green-500 mt-0.5 shrink-0" />
                        <span className="text-sm">{catalyst}</span>
                      </li>
                    ))}
                  </ul>
                </CardContent>
              </Card>
            )}

            {/* 风险提示 */}
            {aiReport?.etfRecommendations?.[0]?.risks && (
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <AlertTriangle className="h-5 w-5 text-yellow-500" />
                    风险提示
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <ul className="space-y-2">
                    {aiReport.etfRecommendations[0].risks.map((risk, i) => (
                      <li key={i} className="flex items-start gap-2">
                        <AlertTriangle className="h-4 w-4 text-yellow-500 mt-0.5 shrink-0" />
                        <span className="text-sm">{risk}</span>
                      </li>
                    ))}
                  </ul>
                </CardContent>
              </Card>
            )}

            {/* 免责声明 */}
            <Card>
              <CardContent className="p-4">
                <p className="text-xs text-muted-foreground">
                  <strong>免责声明：</strong>以上分析仅供参考，不构成投资建议。投资有风险，入市需谨慎。AI分析存在固有局限性，用户应结合自身判断做出投资决策。
                </p>
              </CardContent>
            </Card>
          </div>
        </div>
          </TabsContent>

          <TabsContent value="graph">
            <Card>
              <CardHeader>
                <CardTitle>图谱视角分析</CardTitle>
                <p className="text-sm text-muted-foreground">基于产业链知识图谱的ETF分析</p>
              </CardHeader>
              <CardContent>
                {graphAnalysis ? (
                  <div className="space-y-6">
                    {/* 产业链覆盖度 */}
                    <div>
                      <h3 className="font-semibold mb-3">产业链覆盖度</h3>
                      <div className="grid grid-cols-2 gap-4">
                        <div className="p-4 bg-muted rounded-lg">
                          <p className="text-sm text-muted-foreground mb-1">覆盖节点</p>
                          <p className="text-2xl font-bold">
                            {graphAnalysis.coverage.coveredNodes}/{graphAnalysis.coverage.totalNodes}
                          </p>
                        </div>
                        <div className="p-4 bg-muted rounded-lg">
                          <p className="text-sm text-muted-foreground mb-1">覆盖率</p>
                          <p className="text-2xl font-bold">
                            {(graphAnalysis.coverage.coverageRate * 100).toFixed(1)}%
                          </p>
                        </div>
                      </div>
                      {graphAnalysis.coverage.uncoveredLevels.length > 0 && (
                        <div className="mt-3">
                          <p className="text-sm text-muted-foreground mb-2">未覆盖领域:</p>
                          <div className="flex flex-wrap gap-1">
                            {graphAnalysis.coverage.uncoveredLevels.map((level, i) => (
                              <Badge key={i} variant="outline" className="text-xs">
                                {level}
                              </Badge>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>

                    {/* 周期风险 */}
                    <div>
                      <h3 className="font-semibold mb-3">周期风险分布</h3>
                      <div className="grid grid-cols-2 gap-2 mb-3">
                        <div className="flex justify-between p-2 bg-muted rounded">
                          <span className="text-sm">上升期</span>
                          <span className="font-medium">{(graphAnalysis.cycleRisk.upturn * 100).toFixed(1)}%</span>
                        </div>
                        <div className="flex justify-between p-2 bg-muted rounded">
                          <span className="text-sm">高位</span>
                          <span className="font-medium">{(graphAnalysis.cycleRisk.peak * 100).toFixed(1)}%</span>
                        </div>
                        <div className="flex justify-between p-2 bg-muted rounded">
                          <span className="text-sm">下降期</span>
                          <span className="font-medium">{(graphAnalysis.cycleRisk.downturn * 100).toFixed(1)}%</span>
                        </div>
                        <div className="flex justify-between p-2 bg-muted rounded">
                          <span className="text-sm">底部</span>
                          <span className="font-medium">{(graphAnalysis.cycleRisk.trough * 100).toFixed(1)}%</span>
                        </div>
                      </div>
                      <div className="p-4 bg-muted rounded-lg">
                        <p className="text-sm text-muted-foreground mb-1">风险得分</p>
                        <p className="text-xl font-bold">{graphAnalysis.cycleRisk.riskScore}/100</p>
                      </div>
                    </div>

                    {/* 供应链平衡 */}
                    <div>
                      <h3 className="font-semibold mb-3">供应链平衡</h3>
                      <div className="grid grid-cols-3 gap-2 mb-3">
                        <div className="p-3 bg-muted rounded-lg text-center">
                          <p className="text-xs text-muted-foreground mb-1">上游</p>
                          <p className="text-lg font-bold">{(graphAnalysis.supplyChainBalance.upstream * 100).toFixed(1)}%</p>
                        </div>
                        <div className="p-3 bg-muted rounded-lg text-center">
                          <p className="text-xs text-muted-foreground mb-1">中游</p>
                          <p className="text-lg font-bold">{(graphAnalysis.supplyChainBalance.midstream * 100).toFixed(1)}%</p>
                        </div>
                        <div className="p-3 bg-muted rounded-lg text-center">
                          <p className="text-xs text-muted-foreground mb-1">下游</p>
                          <p className="text-lg font-bold">{(graphAnalysis.supplyChainBalance.downstream * 100).toFixed(1)}%</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        {graphAnalysis.supplyChainBalance.isBalanced ? (
                          <CheckCircle className="h-5 w-5 text-green-500" />
                        ) : (
                          <AlertTriangle className="h-5 w-5 text-yellow-500" />
                        )}
                        <span className="text-sm">
                          {graphAnalysis.supplyChainBalance.isBalanced ? '供应链布局较为均衡' : '供应链存在结构性偏向'}
                        </span>
                      </div>
                    </div>

                    {/* 动量指标 */}
                    <div>
                      <h3 className="font-semibold mb-3">动量指标</h3>
                      <div className="p-4 bg-muted rounded-lg mb-3">
                        <p className="text-sm text-muted-foreground mb-1">加权平均动量</p>
                        <p className="text-2xl font-bold">{graphAnalysis.momentum.weightedAverage.toFixed(1)}</p>
                      </div>
                      <div className="grid grid-cols-3 gap-2">
                        <div className="p-2 bg-muted rounded text-center">
                          <p className="text-xs text-muted-foreground mb-1">高动量</p>
                          <p className="text-sm font-medium">{(graphAnalysis.momentum.distribution.high * 100).toFixed(1)}%</p>
                        </div>
                        <div className="p-2 bg-muted rounded text-center">
                          <p className="text-xs text-muted-foreground mb-1">中动量</p>
                          <p className="text-sm font-medium">{(graphAnalysis.momentum.distribution.medium * 100).toFixed(1)}%</p>
                        </div>
                        <div className="p-2 bg-muted rounded text-center">
                          <p className="text-xs text-muted-foreground mb-1">低动量</p>
                          <p className="text-sm font-medium">{(graphAnalysis.momentum.distribution.low * 100).toFixed(1)}%</p>
                        </div>
                      </div>
                    </div>

                    {/* AI 洞察 */}
                    <div>
                      <h3 className="font-semibold mb-3">AI 洞察</h3>
                      <div className="space-y-2">
                        {graphAnalysis.insights.map((insight, i) => (
                          <div key={i} className="p-3 bg-muted rounded-lg flex items-start gap-2">
                            <Brain className="h-4 w-4 mt-0.5 shrink-0 text-primary" />
                            <p className="text-sm">{insight}</p>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* 演示数据标注 */}
                    <div className="p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
                      <p className="text-xs text-yellow-800">
                        <strong>演示数据：</strong>当前图谱分析基于演示数据。实际生产环境需要完整的产业链知识图谱和ETF持仓映射数据。
                      </p>
                    </div>
                  </div>
                ) : (
                  <p className="text-muted-foreground text-center py-8">输入ETF代码并分析以查看图谱视角</p>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      )}

      {/* 未分析状态 */}
      {!score && !isAnalyzing && (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <Brain className="h-12 w-12 text-muted-foreground mb-4" />
            <p className="text-lg font-medium mb-2">选择ETF开始分析</p>
            <p className="text-sm text-muted-foreground">
              AI将从技术面、资金面、事件面、产业链等多维度进行综合分析
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
