'use client'

import { Suspense, useEffect, useState, useRef } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { ArrowLeft, TrendingUp, TrendingDown, AlertCircle } from 'lucide-react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { MarketInstrumentCard } from '@/components/analysis/MarketInstrumentCard'

interface ETFAnalysis {
  code: string
  name: string
  current_price: number
  price_change_pct: number
  daily_change_pct?: number  // 新增：当日涨跌幅
  ma5?: number
  ma10?: number
  ma20?: number
  ma60?: number
  macd?: { dif: number; dea: number; macd: number }
  boll?: { upper: number; mid: number; lower: number; bandwidth?: number; percent_b?: number }
  dmi?: { pdi: number; mdi: number; adx: number; adxr?: number }
  rsi?: number
  kdj?: { k: number; d: number; j: number }
  cci?: number
  wr?: number
  obv?: number
  vol_ma5?: number
  vol_ma20?: number
  volatility?: number
  max_drawdown?: number
  trend: string
  data_points?: number
  is_fallback?: boolean
}

interface IndexAnalysis {
  code: string
  name?: string
  current_price?: number
  priceChangePct: number
  daily_change_pct?: number  // 新增：当日涨跌幅
  trend: string
  data_points?: number
  is_fallback?: boolean
  source?: string

  // 趋势指标
  ma5?: number
  ma10?: number
  ma20?: number
  ma60?: number
  macd?: { dif: number; dea: number; macd: number }
  boll?: { upper: number; mid: number; lower: number; bandwidth?: number; percent_b?: number }
  dmi?: { pdi: number; mdi: number; adx: number; adxr?: number }

  // 动量指标
  rsi?: number
  kdj?: { k: number; d: number; j: number }
  cci?: number
  wr?: number

  // 成交量指标
  obv?: number
  vol_ma5?: number
  vol_ma20?: number

  // 稳定性指标
  volatility?: number
  max_drawdown?: number
}

interface MarketReportData {
  etfAnalysis: ETFAnalysis[]
  indexAnalysis: IndexAnalysis[]
  trendReport: string
}

function MarketReportContent() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const industryId = searchParams.get('industryId')
  const industryName = searchParams.get('industryName')

  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [data, setData] = useState<MarketReportData | null>(null)
  const [reportTimestamp, setReportTimestamp] = useState<string | null>(null)

  // 使用 ref 防止重复请求
  const hasFetched = useRef(false)

  useEffect(() => {
    if (!industryId || !industryName) {
      setError('缺少必要参数')
      setLoading(false)
      return
    }

    // 如果已经获取过数据，直接返回
    if (hasFetched.current) {
      return
    }

    async function fetchData() {
      try {
        // 首先尝试从sessionStorage读取缓存的报告
        const cachedReport = sessionStorage.getItem('currentMarketReport')
        if (cachedReport) {
          try {
            const parsed = JSON.parse(cachedReport)
            // 验证缓存数据是否匹配当前请求
            if (parsed.industryId === industryId && parsed.data) {
              console.log('使用缓存的报告数据')
              setData({
                etfAnalysis: parsed.data.etfAnalysis || [],
                indexAnalysis: parsed.data.indexAnalysis || [],
                trendReport: parsed.data.trendReport
              })
              setReportTimestamp(parsed.timestamp)
              setLoading(false)
              // 标记已获取
              hasFetched.current = true
              // 清除缓存，避免下次误用
              sessionStorage.removeItem('currentMarketReport')
              return
            }
          } catch (e) {
            console.warn('解析缓存报告失败:', e)
            sessionStorage.removeItem('currentMarketReport')
          }
        }

        // 如果没有缓存，则重新请求
        console.log('从服务器获取新报告')
        const response = await fetch(
          `/api/analysis/industry/${industryId}/market?industry_name=${encodeURIComponent(industryName as string)}&period_days=90`
        )

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}))
          throw new Error(errorData.error || 'Failed to fetch market data')
        }

        const result = await response.json()

        if (!result.success) {
          throw new Error(result.error || 'Analysis failed')
        }

        // 调试日志：查看第一个指数的数据结构
        if (result.index_analysis && result.index_analysis.length > 0) {
          console.log('=== 指数数据调试 ===');
          console.log('第一个指数原始数据:', result.index_analysis[0]);
          console.log('MACD字段:', result.index_analysis[0].macd);
          console.log('MA5字段:', result.index_analysis[0].ma5);
          console.log('RSI字段:', result.index_analysis[0].rsi);
        }

        setData({
          etfAnalysis: result.etf_analysis || [],
          indexAnalysis: (result.index_analysis || []).map((idx: any) => ({
            code: idx.code,
            name: idx.name,
            current_price: idx.current_price,
            priceChangePct: idx.price_change_pct ?? 0,
            daily_change_pct: idx.daily_change_pct,  // 新增：当日涨跌幅
            trend: idx.trend,
            data_points: idx.data_points,
            is_fallback: idx.is_fallback,
            source: idx.source,
            // 趋势指标（后端已返回嵌套结构）
            ma5: idx.ma5,
            ma10: idx.ma10,
            ma20: idx.ma20,
            ma60: idx.ma60,
            macd: idx.macd,
            boll: idx.boll,
            dmi: idx.dmi,
            // 动量指标
            rsi: idx.rsi,
            kdj: idx.kdj,
            cci: idx.cci,
            wr: idx.wr,
            // 成交量指标
            obv: idx.obv,
            vol_ma5: idx.vol_ma5,
            vol_ma20: idx.vol_ma20,
            // 稳定性指标
            volatility: idx.volatility,
            max_drawdown: idx.max_drawdown,
          })),
          trendReport: result.trend_report
        })
        // 标记已获取
        hasFetched.current = true
      } catch (err) {
        setError(err instanceof Error ? err.message : '获取数据失败')
      } finally {
        setLoading(false)
      }
    }

    fetchData()
  }, [industryId, industryName])

  if (loading) {
    return (
      <div className="space-y-6 p-6">
        <Skeleton className="h-10 w-64" />
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-1 space-y-4">
            <Skeleton className="h-96 w-full" />
          </div>
          <div className="lg:col-span-2">
            <Skeleton className="h-96 w-full" />
          </div>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="space-y-6 p-6">
        <Button variant="ghost" onClick={() => router.back()}>
          <ArrowLeft className="mr-2 h-4 w-4" />
          返回
        </Button>
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      </div>
    )
  }

  return (
    <div className="space-y-6 p-6">
      {/* 页面头部 */}
      <div className="flex items-center justify-between">
        <div>
          <Button variant="ghost" onClick={() => router.back()} className="mb-2">
            <ArrowLeft className="mr-2 h-4 w-4" />
            返回
          </Button>
          <h1 className="text-3xl font-bold tracking-tight">{industryName} - 大盘趋势分析报告</h1>
          <div className="flex items-center gap-4 mt-2">
            <p className="text-muted-foreground">
              相关ETF和指数的市场表现与AI分析
            </p>
            {reportTimestamp && (
              <Badge variant="outline" className="text-xs">
                生成时间: {new Date(reportTimestamp).toLocaleString('zh-CN', {
                  month: '2-digit',
                  day: '2-digit',
                  hour: '2-digit',
                  minute: '2-digit'
                })}
              </Badge>
            )}
          </div>
        </div>
      </div>

      {/* 主内容区 - 四栏布局 */}
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        {/* 左侧第一列：ETF数据 */}
        <div className="lg:col-span-1 space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">ETF 指标数据</CardTitle>
              <p className="text-xs text-muted-foreground mt-1">含当日涨跌和期间涨跌（分析周期内累计）</p>
            </CardHeader>
            <CardContent className="space-y-4">
              {data?.etfAnalysis && data.etfAnalysis.length > 0 ? (
                data.etfAnalysis.map((etf) => (
                  <MarketInstrumentCard key={etf.code} data={etf} type="etf" />
                ))
              ) : (
                <div className="text-sm text-muted-foreground text-center py-4">
                  暂无ETF数据
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* 左侧第二列：指数数据 */}
        <div className="lg:col-span-1">
          {data?.indexAnalysis && data.indexAnalysis.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">相关指数</CardTitle>
                <p className="text-xs text-muted-foreground mt-1">含当日涨跌和期间涨跌（分析周期内累计）</p>
              </CardHeader>
              <CardContent className="space-y-3">
                {data.indexAnalysis.map((index) => (
                  <MarketInstrumentCard key={index.code} data={index} type="index" />
                ))}
              </CardContent>
            </Card>
          )}
        </div>

        {/* 右侧：AI分析报告（占2列） */}
        <div className="lg:col-span-2">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">AI 分析报告</CardTitle>
            </CardHeader>
            <CardContent>
              {data?.trendReport ? (
                <div className="prose prose-sm max-w-none dark:prose-invert prose-headings:font-semibold prose-h1:text-2xl prose-h2:text-xl prose-h3:text-lg prose-p:leading-relaxed prose-li:leading-relaxed">
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>
                    {data.trendReport}
                  </ReactMarkdown>
                </div>
              ) : (
                <div className="text-sm text-muted-foreground text-center py-8">
                  暂无分析报告
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}

export default function MarketReportPage() {
  return (
    <Suspense fallback={<div className="space-y-6 p-6"><Skeleton className="h-10 w-64" /><Skeleton className="h-96 w-full" /></div>}>
      <MarketReportContent />
    </Suspense>
  )
}
