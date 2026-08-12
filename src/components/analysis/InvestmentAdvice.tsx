'use client'

import { useState, useEffect } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Badge } from '@/components/ui/badge'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Loader2, Info, TrendingUp, TrendingDown, DollarSign, PieChart } from 'lucide-react'
import { Skeleton } from '@/components/ui/skeleton'

interface Industry {
  id: string
  name: string
  description?: string
}

interface InvestmentPreference {
  riskTolerance: 'conservative' | 'balanced' | 'aggressive'
  investmentHorizon: 'short' | 'medium' | 'long'
  preferredSectors: string[]
}

interface Position {
  symbol: string
  name: string
  quantity: number
  avgCost: number
  currentPrice: number
  marketValue: number
  profitLoss: number
  profitLossPct: number
}

interface InvestmentAdviceResult {
  industry: string
  strategy: string
  recommendations: Array<{
    action: 'buy' | 'sell' | 'hold' | 'watch'
    target: string
    targetType: 'etf' | 'index'
    reason: string
    allocation?: number
    targetPrice?: number
  }>
  riskWarning?: string
  summary: string
}

export function InvestmentAdvice() {
  const [industries, setIndustries] = useState<Industry[]>([])
  const [selectedIndustry, setSelectedIndustry] = useState<string>('')
  const [loading, setLoading] = useState(false)
  const [loadingIndustries, setLoadingIndustries] = useState(true)
  const [adviceResult, setAdviceResult] = useState<InvestmentAdviceResult | null>(null)
  const [error, setError] = useState<string | null>(null)

  // 用户投资偏好（TODO: 从用户设置中获取）
  const [preferences, setPreferences] = useState<InvestmentPreference>({
    riskTolerance: 'balanced',
    investmentHorizon: 'medium',
    preferredSectors: []
  })

  // 用户持仓（TODO: 从持仓API获取）
  const [positions, setPositions] = useState<Position[]>([])

  // 加载产业列表
  useEffect(() => {
    async function loadIndustries() {
      try {
        const response = await fetch('/api/graph/industries')
        if (!response.ok) throw new Error('Failed to load industries')

        const data = await response.json()
        if (data.industries && Array.isArray(data.industries)) {
          setIndustries(data.industries)
          if (data.industries.length > 0) {
            setSelectedIndustry(data.industries[0].id)
          }
        }
      } catch (err) {
        console.error('Error loading industries:', err)
        setError('加载产业列表失败')
      } finally {
        setLoadingIndustries(false)
      }
    }

    loadIndustries()
  }, [])

  // 生成投资建议
  const handleGenerateAdvice = async () => {
    if (!selectedIndustry) return

    setLoading(true)
    setError(null)
    setAdviceResult(null)

    try {
      const industry = industries.find(i => i.id === selectedIndustry)
      if (!industry) throw new Error('Industry not found')

      // 1. 获取领域分析数据
      const [companyResponse, marketResponse] = await Promise.all([
        fetch(`/api/analysis/industry/${selectedIndustry}/companies?period_days=90`),
        fetch(`/api/analysis/industry/${selectedIndustry}/market?industry_name=${encodeURIComponent(industry.name)}&period_days=90`)
      ])

      const companyData = companyResponse.ok ? await companyResponse.json() : null
      const marketData = marketResponse.ok ? await marketResponse.json() : null

      // 2. 调用AI生成投资建议
      const response = await fetch('/api/ai/investment-advice', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          industry: industry.name,
          companyTrend: companyData?.trend_report,
          marketTrend: marketData?.trend_report,
          etfAnalysis: marketData?.etf_analysis,
          preferences,
          positions
        })
      })

      if (!response.ok) throw new Error('Failed to generate advice')

      const result = await response.json()
      setAdviceResult(result.advice)

    } catch (err) {
      console.error('Generate advice error:', err)
      setError(err instanceof Error ? err.message : '生成投资建议失败，请重试')
    } finally {
      setLoading(false)
    }
  }

  if (loadingIndustries) {
    return (
      <Card>
        <CardHeader>
          <Skeleton className="h-8 w-64" />
          <Skeleton className="h-4 w-96 mt-2" />
        </CardHeader>
        <CardContent>
          <Skeleton className="h-10 w-full" />
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="space-y-6">
      {/* 功能说明 */}
      <Alert>
        <Info className="h-4 w-4" />
        <AlertTitle>功能说明</AlertTitle>
        <AlertDescription>
          投资建议功能将结合领域发展情况、用户投资偏好和持仓情况，从不同投资角度分析当前应做的操作（增仓、减仓、建仓、观察等），颗粒度细到ETF及指数。
          <br />
          <span className="text-amber-600 font-medium">注意：用户持仓链路尚未打通，当前为框架演示版本。</span>
        </AlertDescription>
      </Alert>

      {/* 参数配置 */}
      <Card>
        <CardHeader>
          <CardTitle>投资建议配置</CardTitle>
          <CardDescription>
            选择分析领域并配置投资偏好，生成个性化投资建议
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* 领域选择 */}
          <div className="space-y-2">
            <label className="text-sm font-medium">分析领域</label>
            <Select value={selectedIndustry} onValueChange={(v) => setSelectedIndustry(v || '')}>
              <SelectTrigger>
                <SelectValue placeholder="选择产业领域" />
              </SelectTrigger>
              <SelectContent>
                {industries.map((industry) => (
                  <SelectItem key={industry.id} value={industry.id}>
                    {industry.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* 风险偏好 */}
          <div className="space-y-2">
            <label className="text-sm font-medium">风险偏好</label>
            <Select
              value={preferences.riskTolerance}
              onValueChange={(v) => setPreferences({ ...preferences, riskTolerance: v as any })}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="conservative">保守型</SelectItem>
                <SelectItem value="balanced">平衡型</SelectItem>
                <SelectItem value="aggressive">进取型</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* 投资周期 */}
          <div className="space-y-2">
            <label className="text-sm font-medium">投资周期</label>
            <Select
              value={preferences.investmentHorizon}
              onValueChange={(v) => setPreferences({ ...preferences, investmentHorizon: v as any })}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="short">短期（1-3个月）</SelectItem>
                <SelectItem value="medium">中期（3-12个月）</SelectItem>
                <SelectItem value="long">长期（1年以上）</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <Button
            onClick={handleGenerateAdvice}
            disabled={loading || !selectedIndustry}
            className="w-full"
          >
            {loading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                生成中...
              </>
            ) : (
              '生成投资建议'
            )}
          </Button>

          {error && (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
        </CardContent>
      </Card>

      {/* 当前持仓 */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <PieChart className="h-5 w-5" />
            当前持仓
          </CardTitle>
          <CardDescription>
            持仓链路尚未打通，功能开发中
          </CardDescription>
        </CardHeader>
        <CardContent>
          {positions.length > 0 ? (
            <div className="space-y-2">
              {positions.map((pos) => (
                <div key={pos.symbol} className="flex items-center justify-between p-3 rounded-lg border">
                  <div>
                    <div className="font-medium">{pos.name}</div>
                    <div className="text-sm text-muted-foreground">{pos.symbol} · {pos.quantity}股</div>
                  </div>
                  <div className="text-right">
                    <div className="font-semibold">{pos.marketValue.toLocaleString('zh-CN', { style: 'currency', currency: 'CNY' })}</div>
                    <div className={`text-sm ${pos.profitLossPct >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                      {pos.profitLossPct >= 0 ? '+' : ''}{pos.profitLossPct.toFixed(2)}%
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-8 text-muted-foreground">
              暂无持仓数据
            </div>
          )}
        </CardContent>
      </Card>

      {/* 投资建议结果 */}
      {adviceResult && (
        <>
          {/* 风险提示 */}
          {adviceResult.riskWarning && (
            <Alert variant="destructive">
              <AlertTitle>风险提示</AlertTitle>
              <AlertDescription>{adviceResult.riskWarning}</AlertDescription>
            </Alert>
          )}

          {/* 投资策略 */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <DollarSign className="h-5 w-5" />
                投资策略
              </CardTitle>
              <CardDescription>
                基于 {adviceResult.industry} 领域的分析建议
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="prose prose-sm max-w-none dark:prose-invert">
                <div className="whitespace-pre-wrap">{adviceResult.strategy}</div>
              </div>
            </CardContent>
          </Card>

          {/* 具体操作建议 */}
          <Card>
            <CardHeader>
              <CardTitle>操作建议</CardTitle>
              <CardDescription>
                具体到ETF和指数的操作建议
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {adviceResult.recommendations.map((rec, idx) => (
                  <div key={idx} className="p-4 rounded-lg border">
                    <div className="flex items-start justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <Badge
                          variant={
                            rec.action === 'buy' ? 'default' :
                            rec.action === 'sell' ? 'destructive' :
                            rec.action === 'hold' ? 'secondary' : 'outline'
                          }
                        >
                          {rec.action === 'buy' ? '建仓' :
                           rec.action === 'sell' ? '减仓' :
                           rec.action === 'hold' ? '持有' : '观察'}
                        </Badge>
                        <span className="font-semibold">{rec.target}</span>
                        <Badge variant="outline" className="text-xs">
                          {rec.targetType === 'etf' ? 'ETF' : '指数'}
                        </Badge>
                      </div>
                      {rec.allocation && (
                        <div className="text-sm text-muted-foreground">
                          建议配置: {rec.allocation}%
                        </div>
                      )}
                    </div>
                    <div className="text-sm text-muted-foreground">{rec.reason}</div>
                    {rec.targetPrice && (
                      <div className="text-sm mt-2 text-blue-600">
                        目标价位: ¥{rec.targetPrice.toFixed(3)}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* 总结 */}
          <Card>
            <CardHeader>
              <CardTitle>建议总结</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="prose prose-sm max-w-none dark:prose-invert">
                <div className="whitespace-pre-wrap">{adviceResult.summary}</div>
              </div>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  )
}
