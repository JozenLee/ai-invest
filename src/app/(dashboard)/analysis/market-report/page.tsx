'use client'

import { Suspense, useEffect, useState, useRef } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { ArrowLeft, AlertCircle, Network } from 'lucide-react'
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
  priceChangePct?: number
  price_change_pct?: number
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
  marketIndices: Array<Record<string, unknown>>
  trendReport: string
  etfSelection?: Array<{ node?: string; code: string; name?: string; relevance?: number; selection_reason?: string }>
}

function getMarketTrendLabel(value: unknown) {
  const trend = String(value || '').toLowerCase()
  if (trend.includes('bullish') || trend.includes('up') || trend.includes('上涨') || trend.includes('看涨')) {
    return '偏强'
  }
  if (trend.includes('bearish') || trend.includes('down') || trend.includes('下跌') || trend.includes('看跌')) {
    return '偏弱'
  }
  return '震荡'
}

function normalizeIndexAnalysis(items: unknown): IndexAnalysis[] {
  if (!Array.isArray(items)) return []

  return items.map((item) => {
    const index = (item && typeof item === 'object' ? item : {}) as Record<string, unknown>
    const priceChangePct = Number(index.price_change_pct ?? index.priceChangePct ?? 0)

    return {
      ...index,
      code: String(index.code || ''),
      name: typeof index.name === 'string' ? index.name : undefined,
      current_price: typeof index.current_price === 'number' ? index.current_price : undefined,
      priceChangePct,
      price_change_pct: priceChangePct,
      daily_change_pct: typeof index.daily_change_pct === 'number' ? index.daily_change_pct : undefined,
      trend: String(index.trend || ''),
    } as IndexAnalysis
  }).filter((item) => item.code)
}

function normalizeMacroIndices(value: unknown): IndexAnalysis[] {
  if (!Array.isArray(value)) return []

  return value.map((item) => {
    const index = (item && typeof item === 'object' ? item : {}) as Record<string, unknown>
    const changePct = Number(index.changePercent ?? index.changePct ?? index.change_percent ?? 0)
    const currentPrice = Number(index.current ?? index.price ?? index.current_price ?? 0)

    return {
      code: String(index.code || ''),
      name: typeof index.name === 'string' ? index.name : undefined,
      current_price: Number.isFinite(currentPrice) ? currentPrice : undefined,
      priceChangePct: changePct,
      price_change_pct: changePct,
      daily_change_pct: changePct,
      trend: changePct > 0 ? '上涨' : changePct < 0 ? '下跌' : '震荡',
    }
  }).filter((item) => item.code && item.current_price != null && item.current_price > 0)
}

function MarketReportContent() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const industryId = searchParams.get('industryId')
  const industryName = searchParams.get('industryName')
  const reportId = searchParams.get('reportId')

  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [data, setData] = useState<MarketReportData | null>(null)
  const [reportTimestamp, setReportTimestamp] = useState<string | null>(null)
  const [reportTitle, setReportTitle] = useState(`${industryName || '产业'} 大盘趋势分析报告`)
  const [reportSummary, setReportSummary] = useState<string | null>(null)

  // 使用 ref 防止重复请求
  const hasFetched = useRef(false)

  useEffect(() => {
    if (!industryId || !industryName) {
      return
    }

    hasFetched.current = false

    // 如果已经获取过数据，直接返回
    if (hasFetched.current) {
      return
    }

    async function fetchData() {
      try {
        if (reportId) {
          const reportResponse = await fetch(`/api/analysis/reports/${reportId}`)
          const reportPayload = await reportResponse.json().catch(() => ({}))
          if (!reportResponse.ok || reportPayload.success === false) {
            throw new Error(reportPayload.error || '读取市场报告失败')
          }

          const savedData = reportPayload.report?.data
          if (savedData) {
            setData({
              etfAnalysis: savedData.etfAnalysis || [],
              indexAnalysis: normalizeIndexAnalysis(savedData.indexAnalysis),
              marketIndices: savedData.marketIndices || savedData.marketOverview?.indices || [],
              trendReport: savedData.trendReport || reportPayload.report.content || '',
              etfSelection: savedData.etfSelection || savedData.etf_selection || [],
            })
            setReportTimestamp(reportPayload.report.createdAt)
            setReportTitle(reportPayload.report.title || `${industryName} 大盘趋势分析报告`)
            setReportSummary(reportPayload.report.summary || null)
            setLoading(false)
            hasFetched.current = true
            return
          }
        }

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
                indexAnalysis: normalizeIndexAnalysis(parsed.data.indexAnalysis),
                marketIndices: parsed.data.marketIndices || parsed.data.marketOverview?.indices || [],
                trendReport: parsed.data.trendReport
                ,etfSelection: parsed.data.etfSelection || parsed.data.etf_selection || []
              })
              setReportTimestamp(parsed.timestamp)
              setReportTitle(`${industryName} 大盘趋势分析报告`)
              setReportSummary(null)
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
          indexAnalysis: normalizeIndexAnalysis((Array.isArray(result.index_analysis) ? result.index_analysis : []).map((item: unknown) => {
            const idx = item as Record<string, unknown>
            return {
            code: String(idx.code || ''),
            name: typeof idx.name === 'string' ? idx.name : undefined,
            current_price: typeof idx.current_price === 'number' ? idx.current_price : undefined,
            priceChangePct: Number(idx.price_change_pct ?? 0),
            daily_change_pct: typeof idx.daily_change_pct === 'number' ? idx.daily_change_pct : undefined,
            trend: String(idx.trend || ''),
            data_points: typeof idx.data_points === 'number' ? idx.data_points : undefined,
            is_fallback: typeof idx.is_fallback === 'boolean' ? idx.is_fallback : undefined,
            source: typeof idx.source === 'string' ? idx.source : undefined,
            // 趋势指标（后端已返回嵌套结构）
            ma5: typeof idx.ma5 === 'number' ? idx.ma5 : undefined,
            ma10: typeof idx.ma10 === 'number' ? idx.ma10 : undefined,
            ma20: typeof idx.ma20 === 'number' ? idx.ma20 : undefined,
            ma60: typeof idx.ma60 === 'number' ? idx.ma60 : undefined,
            macd: idx.macd as IndexAnalysis['macd'],
            boll: idx.boll as IndexAnalysis['boll'],
            dmi: idx.dmi as IndexAnalysis['dmi'],
            // 动量指标
            rsi: typeof idx.rsi === 'number' ? idx.rsi : undefined,
            kdj: idx.kdj as IndexAnalysis['kdj'],
            cci: typeof idx.cci === 'number' ? idx.cci : undefined,
            wr: typeof idx.wr === 'number' ? idx.wr : undefined,
            // 成交量指标
            obv: typeof idx.obv === 'number' ? idx.obv : undefined,
            vol_ma5: typeof idx.vol_ma5 === 'number' ? idx.vol_ma5 : undefined,
            vol_ma20: typeof idx.vol_ma20 === 'number' ? idx.vol_ma20 : undefined,
            // 稳定性指标
            volatility: typeof idx.volatility === 'number' ? idx.volatility : undefined,
            max_drawdown: typeof idx.max_drawdown === 'number' ? idx.max_drawdown : undefined,
            }
          })),
          marketIndices: Array.isArray(result.market_indices) ? result.market_indices : [],
          trendReport: result.trend_report
          ,etfSelection: result.etf_selection || []
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
  }, [industryId, industryName, reportId])

  if (!industryId || !industryName) {
    return (
      <div className="space-y-6 p-6">
        <Button variant="ghost" onClick={() => router.back()}>
          <ArrowLeft className="mr-2 h-4 w-4" />
          返回
        </Button>
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>缺少必要参数</AlertDescription>
        </Alert>
      </div>
    )
  }

  if (loading) {
    return (
      <div className="space-y-6 p-6">
        <Skeleton className="h-10 w-64" />
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          <div className="space-y-4 lg:col-span-1">
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

  const etfItems = data?.etfAnalysis || []
  const etfSelection = data?.etfSelection || []
  const selectionByNode = etfSelection.reduce<Record<string, typeof etfSelection>>((groups, item) => {
    const node = item.node || '未命名节点'
    groups[node] = [...(groups[node] || []), item]
    return groups
  }, {})
  const macroIndexItems = normalizeMacroIndices(data?.marketIndices)
  const marketItems = [...etfItems, ...macroIndexItems]
  const strongItems = marketItems.filter((item) => {
    const trend = 'trend' in item ? item.trend : ''
    return getMarketTrendLabel(trend) === '偏强'
  }).length
  const weakItems = marketItems.filter((item) => {
    const trend = 'trend' in item ? item.trend : ''
    return getMarketTrendLabel(trend) === '偏弱'
  }).length

  return (
    <div className="space-y-6 p-6">
      {/* 页面头部 */}
      <div className="flex items-center justify-between">
        <div>
          <Button variant="ghost" onClick={() => router.back()} className="mb-2">
            <ArrowLeft className="mr-2 h-4 w-4" />
            返回
          </Button>
          <h1 className="text-3xl font-bold tracking-tight">{reportTitle}</h1>
          <div className="flex items-center gap-4 mt-2">
            <p className="text-muted-foreground">
              查看市场数据、趋势表现和分析结论
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

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">分析依据与市场数据</CardTitle>
          {reportSummary && <p className="text-sm leading-6 text-muted-foreground">{reportSummary}</p>}
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="grid gap-3 sm:grid-cols-4">
            <div className="rounded-lg border bg-muted/20 p-3">
              <div className="text-2xl font-semibold">{etfItems.length}</div>
              <div className="text-xs text-muted-foreground">相关 ETF</div>
            </div>
            <div className="rounded-lg border bg-muted/20 p-3">
              <div className="text-2xl font-semibold">{macroIndexItems.length}</div>
              <div className="text-xs text-muted-foreground">市场宏观指数</div>
            </div>
            <div className="rounded-lg border bg-muted/20 p-3">
              <div className="text-2xl font-semibold text-red-600">{strongItems}</div>
              <div className="text-xs text-muted-foreground">偏强标的</div>
            </div>
            <div className="rounded-lg border bg-muted/20 p-3">
              <div className="text-2xl font-semibold text-green-600">{weakItems}</div>
              <div className="text-xs text-muted-foreground">偏弱标的</div>
            </div>
          </div>

          <div className="rounded-xl border border-primary/20 bg-primary/[0.03] p-4">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <div className="flex items-center gap-2 text-sm font-semibold"><span className="flex size-7 items-center justify-center rounded-lg bg-primary/10 text-primary"><Network className="size-4" aria-hidden="true" /></span>ETF 选择逻辑</div>
                <p className="mt-1 max-w-3xl text-xs leading-5 text-muted-foreground">候选 ETF 来自知识图谱已匹配节点。每个有数据的节点保留 1 只代表性最高的 ETF，必要时再补 1 只与首选差异更大的 ETF，用于覆盖产业链不同环节与发展方向。</p>
              </div>
              <Badge variant="secondary" className="w-fit shrink-0">{etfSelection.length || etfItems.length} 只入选</Badge>
            </div>
            {etfSelection.length > 0 ? <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">{Object.entries(selectionByNode).map(([node, items]) => <div key={node} className="rounded-lg border bg-background/80 p-3"><div className="mb-2 flex items-center justify-between gap-2"><span className="truncate text-xs font-semibold">{node}</span><span className="text-[11px] text-muted-foreground">{items.length} 只</span></div><div className="space-y-2">{items.map((item) => <div key={`${node}-${item.code}`} className="flex items-center justify-between gap-2 rounded-md bg-muted/35 px-2.5 py-2"><div className="min-w-0"><div className="truncate text-xs font-medium">{item.name || item.code}</div><div className="mt-0.5 font-mono text-[10px] text-muted-foreground">{item.code}</div></div><Badge variant="outline" className="shrink-0 text-[10px]">{item.selection_reason || '节点代表'}</Badge></div>)}</div></div>)}</div> : <p className="mt-3 text-xs text-muted-foreground">历史报告未保存节点级筛选快照；当前仅展示已返回的 ETF 样本。</p>}
          </div>

          <div className="space-y-6">
            <Card>
              <CardHeader>
              <CardTitle className="text-base">市场宏观指数</CardTitle>
              <p className="text-xs text-muted-foreground">上证、深证、创业板、科创 50、沪深 300 等主要市场指数</p>
              </CardHeader>
              <CardContent className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                {macroIndexItems.length > 0 ? macroIndexItems.map((index) => (
                  <MarketInstrumentCard key={index.code} data={index} type="index" />
                )) : <div className="py-4 text-center text-sm text-muted-foreground sm:col-span-2 lg:col-span-4">暂无市场宏观指数数据</div>}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">ETF 指标数据</CardTitle>
                <p className="text-xs text-muted-foreground">分析周期内的行情与技术指标</p>
              </CardHeader>
              <CardContent className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                {etfItems.length > 0 ? etfItems.map((etf) => (
                  <MarketInstrumentCard key={etf.code} data={etf} type="etf" />
                )) : <div className="py-4 text-center text-sm text-muted-foreground">暂无 ETF 数据</div>}
              </CardContent>
            </Card>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">分析报告</CardTitle>
        </CardHeader>
        <CardContent>
          {data?.trendReport ? (
            <article className="prose prose-sm max-w-none dark:prose-invert prose-headings:font-semibold prose-h1:text-2xl prose-h2:text-xl prose-h3:text-lg prose-p:leading-7 prose-li:leading-7 prose-table:block prose-table:overflow-x-auto">
              <ReactMarkdown remarkPlugins={[remarkGfm]}>{data.trendReport}</ReactMarkdown>
            </article>
          ) : (
            <div className="py-8 text-center text-sm text-muted-foreground">暂无分析报告</div>
          )}
        </CardContent>
      </Card>
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
