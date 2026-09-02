'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Badge } from '@/components/ui/badge'
import { Loader2, TrendingUp, AlertCircle, BarChart3, Building2, Newspaper, Info, ChevronDown, ChevronUp, FileText, Activity, Sparkles, CircleCheck, CircleX, TriangleAlert, Network } from 'lucide-react'
import { Skeleton } from '@/components/ui/skeleton'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { Progress } from '@/components/ui/progress'
import { NewsAnalysisSection } from '@/components/analysis/NewsAnalysisSection'
import { AnalysisModuleCard } from '@/components/analysis/AnalysisModuleCard'
import { buildAIAnalysisEndpoint, getAIAnalysisModule } from '@/config/ai-analysis-modules'

interface Industry {
  id: string
  name: string
  description?: string
}

interface CompanyTrendCompany {
  id?: string
  name: string
  symbol?: string
  market?: string
  market_position?: string
  node_refs?: Array<{ stage_name?: string; segment_name?: string }>
  price_metrics?: {
    current_price?: number | null
    price_change_pct?: number | null
    volatility?: number | null
    max_drawdown?: number | null
    data_points?: number
  }
  financial_metrics?: {
    latest_period?: string | null
    revenue?: number | null
    net_profit?: number | null
    revenue_growth?: number | null
    profit_growth?: number | null
    records?: number
  }
  announcement_count?: number
  important_announcements?: number
  announcement_samples?: Array<{ title: string; date?: string; url?: string }>
  data_availability?: {
    quote?: boolean
    financial?: boolean
    announcements?: boolean
    financial_records?: number
    announcement_records?: number
  }
  price_change_pct?: number
  priceChangePct?: number
  composite_score?: number
  compositeScore?: number
}

interface CompanyTrend {
  totalCompanies: number
  analyzedCompanies?: number
  topCompanies: CompanyTrendCompany[]
  companySummaries?: CompanyTrendCompany[]
  graph?: {
    stageCount?: number
    segmentCount?: number
    companyCount?: number
    stages?: Array<{ id?: string; name: string; segments: string[]; companyCount: number }>
  }
  dataCoverage?: {
    graphCompanies?: number
    fetchedCompanies?: number
    analyzedCompanies?: number
    companiesWithAnyData?: number
    quoteCoverage?: number
    financialCoverage?: number
    announcementCoverage?: number
    missingSymbol?: number
  }
  source?: {
    provider?: string
    adapter?: string
    status?: string
    note?: string
    capabilities?: Record<string, { available?: boolean; markets?: string[]; datasets?: string[] }>
  }
  trendReport: string
}

interface ETFAnalysis {
  code: string
  name: string
  current_price: number
  price_change_pct: number

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

  trend: string
  data_points?: number
  is_fallback?: boolean
}

interface MarketTrend {
  etfAnalysis: Array<ETFAnalysis>
  indexAnalysis: Array<{
    code: string
    priceChangePct: number
    trend: string
  }>
  marketOverview?: {
    indices?: Array<Record<string, unknown>>
  } | null
  marketIndices?: Array<Record<string, unknown>>
  trendReport: string
}

interface AnalysisSection<T = unknown> {
  loading: boolean
  error: string | null
  data: T | null
}

interface SavedMarketReport {
  id: string
  timestamp: string
  industryId: string
  industryName: string
  title: string
  data: MarketTrend
}

interface SavedCompanyReport {
  id: string
  timestamp: string
  industryId: string
  industryName: string
  title: string
  data: CompanyTrend
}

function getMarketReportTitle(report: Pick<SavedMarketReport, 'title' | 'industryName'>) {
  const title = typeof report.title === 'string' ? report.title.trim() : ''
  return title && /[\u4e00-\u9fff]/.test(title)
    ? title
    : `${report.industryName} 大盘趋势分析报告`
}

function getCompanyReportTitle(report: Pick<SavedCompanyReport, 'title' | 'industryName'>) {
  const title = typeof report.title === 'string' ? report.title.trim() : ''
  return title && /[\u4e00-\u9fff]/.test(title) && !/^[a-z0-9_-]{16,}$/i.test(title)
    ? title
    : `${report.industryName} 企业发展趋势分析报告`
}

export function IndustryAnalysis() {
  const router = useRouter()
  const [industries, setIndustries] = useState<Industry[]>([])
  const [selectedIndustry, setSelectedIndustry] = useState<string>('')
  const [loadingIndustries, setLoadingIndustries] = useState(true)
  const [industriesError, setIndustriesError] = useState<string | null>(null)
  const [expandedETFs, setExpandedETFs] = useState<Set<string>>(new Set())
  const [showCurrentMarketReport, setShowCurrentMarketReport] = useState(false)

  // 报告缓存（最多保存5份）
  const [savedReports, setSavedReports] = useState<SavedMarketReport[]>([])
  const [selectedReportId, setSelectedReportId] = useState<string | null>(null)
  const [savedCompanyReports, setSavedCompanyReports] = useState<SavedCompanyReport[]>([])
  const [selectedCompanyReportId, setSelectedCompanyReportId] = useState<string | null>(null)

  // 从服务端加载历史报告，报告内容和分析依据可跨浏览器保留。
  useEffect(() => {
    let cancelled = false

    async function loadReports() {
      if (!selectedIndustry) return

      try {
        const response = await fetch(`/api/analysis/reports?industryId=${encodeURIComponent(selectedIndustry)}&type=market&limit=20`)
        const payload = await response.json().catch(() => ({}))
        if (!cancelled && response.ok && payload.success) {
          setSavedReports((payload.reports || []).map((report: { id: string; title?: string; createdAt: string; industryId: string; industryName: string; data?: MarketTrend }) => ({
            id: report.id,
            timestamp: report.createdAt,
            industryId: report.industryId,
            industryName: report.industryName,
            title: report.title || `${report.industryName} 大盘趋势分析报告`,
            data: report.data || { etfAnalysis: [], indexAnalysis: [], trendReport: '' },
          })))
        }
      } catch (error) {
        console.error('Failed to load market analysis reports:', error)
      }
    }

    loadReports()
    return () => { cancelled = true }
  }, [selectedIndustry])

  useEffect(() => {
    let cancelled = false

    async function loadCompanyReports() {
      if (!selectedIndustry) return

      try {
        const response = await fetch(`/api/analysis/reports?industryId=${encodeURIComponent(selectedIndustry)}&type=company&limit=20`)
        const payload = await response.json().catch(() => ({}))
        if (!cancelled && response.ok && payload.success) {
          setSavedCompanyReports((payload.reports || []).map((report: { id: string; title?: string; createdAt: string; industryId: string; industryName: string; data?: CompanyTrend }) => ({
            id: report.id,
            timestamp: report.createdAt,
            industryId: report.industryId,
            industryName: report.industryName,
            title: getCompanyReportTitle({
              title: report.title || '',
              industryName: report.industryName,
            }),
            data: report.data || { totalCompanies: 0, topCompanies: [], trendReport: '' },
          })))
        }
      } catch (error) {
        console.error('Failed to load company analysis reports:', error)
      }
    }

    loadCompanyReports()
    return () => { cancelled = true }
  }, [selectedIndustry])

  // 各分析模块的独立状态
  const [companySection, setCompanySection] = useState<AnalysisSection<CompanyTrend>>({
    loading: false,
    error: null,
    data: null
  })
  const [companyReportGenerating, setCompanyReportGenerating] = useState(false)
  const [marketSection, setMarketSection] = useState<AnalysisSection<MarketTrend>>({
    loading: false,
    error: null,
    data: null
  })
  const [comprehensiveSection, setComprehensiveSection] = useState<AnalysisSection<string>>({
    loading: false,
    error: null,
    data: null
  })

  // 加载产业列表
  useEffect(() => {
    async function loadIndustries() {
      try {
        const response = await fetch('/api/graph/industries')
        const result = await response.json().catch(() => ({}))

        if (!response.ok || result.success === false) {
          throw new Error(
            result.message || result.error ||
            '产业列表加载失败，请确认 Python 数据服务已启动（localhost:8000）'
          )
        }

        if (!Array.isArray(result.data)) {
          throw new Error('产业列表返回格式异常，请刷新页面重试')
        }

        setIndustriesError(null)
        setIndustries(result.data)
        if (result.data.length > 0) {
          setSelectedIndustry(result.data[0].id)
        }
      } catch (err) {
        console.error('Error loading industries:', err)
        setIndustriesError(err instanceof Error ? err.message : '产业列表加载失败')
      } finally {
        setLoadingIndustries(false)
      }
    }

    loadIndustries()
  }, [])

  const getSelectedIndustry = () => {
    return industries.find(i => i.id === selectedIndustry)
  }

  const marketData = marketSection.data

  const toggleETF = (code: string) => {
    setExpandedETFs((previous) => {
      const next = new Set(previous)
      if (next.has(code)) next.delete(code)
      else next.add(code)
      return next
    })
  }

  // 保留技术指标组件代码，供后续在完整报告页复用。
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const renderTechnicalIndicators = (etf: ETFAnalysis) => {
    return (
      <Collapsible open={expandedETFs.has(etf.code)} onOpenChange={() => toggleETF(etf.code)}>
        <CollapsibleTrigger className="w-full flex items-center justify-between px-4 py-2 mt-2 text-xs rounded-md hover:bg-accent hover:text-accent-foreground transition-colors border border-input bg-background">
          <span>查看技术指标详情</span>
          {expandedETFs.has(etf.code) ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
        </CollapsibleTrigger>
        <CollapsibleContent className="mt-3">
          <Tabs defaultValue="trend" className="w-full">
            <TabsList className="grid w-full grid-cols-3">
              <TabsTrigger value="trend">趋势指标</TabsTrigger>
              <TabsTrigger value="momentum">动量指标</TabsTrigger>
              <TabsTrigger value="volume">成交量指标</TabsTrigger>
            </TabsList>

            {/* 趋势指标 */}
            <TabsContent value="trend" className="space-y-3 mt-3">
              {/* 均线 */}
              {(etf.ma5 || etf.ma10 || etf.ma20 || etf.ma60) && (
                <div className="p-3 rounded-lg bg-muted/50 space-y-2">
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger className="text-xs font-semibold flex items-center gap-1 cursor-help">
                        移动平均线 (MA)
                        <Info className="h-3 w-3 text-muted-foreground" />
                      </TooltipTrigger>
                      <TooltipContent>
                        <p className="max-w-xs text-xs">移动平均线用于平滑价格波动，识别趋势方向。短期均线上穿长期均线为金叉(看涨)，下穿为死叉(看跌)。</p>
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    {etf.ma5 != null && (
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">MA5:</span>
                        <span className="font-medium">{etf.ma5.toFixed(3)}</span>
                      </div>
                    )}
                    {etf.ma10 != null && (
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">MA10:</span>
                        <span className="font-medium">{etf.ma10.toFixed(3)}</span>
                      </div>
                    )}
                    {etf.ma20 != null && (
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">MA20:</span>
                        <span className="font-medium">{etf.ma20.toFixed(3)}</span>
                      </div>
                    )}
                    {etf.ma60 != null && (
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">MA60:</span>
                        <span className="font-medium">{etf.ma60.toFixed(3)}</span>
                      </div>
                    )}
                  </div>
                  {/* 均线排列判断 */}
                  {etf.ma5 != null && etf.ma20 != null && (
                    <div className="pt-2 border-t">
                      {etf.ma5 > etf.ma20 ? (
                        <Badge variant="default" className="text-xs bg-green-500">
                          多头排列
                        </Badge>
                      ) : (
                        <Badge variant="secondary" className="text-xs bg-red-500 text-white">
                          空头排列
                        </Badge>
                      )}
                    </div>
                  )}
                </div>
              )}

              {/* MACD */}
              {etf.macd && etf.macd.dif != null && etf.macd.dea != null && etf.macd.macd != null && (
                <div className="p-3 rounded-lg bg-muted/50 space-y-2">
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger className="text-xs font-semibold flex items-center gap-1 cursor-help">
                        MACD
                        <Info className="h-3 w-3 text-muted-foreground" />
                      </TooltipTrigger>
                      <TooltipContent>
                        <p className="max-w-xs text-xs">指数平滑异同移动平均线，用于判断买卖时机。DIF上穿DEA为金叉(买入信号)，下穿为死叉(卖出信号)。</p>
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                  <div className="grid grid-cols-3 gap-2 text-xs">
                    <div className="flex flex-col">
                      <span className="text-muted-foreground">DIF</span>
                      <span className="font-medium">{etf.macd.dif.toFixed(4)}</span>
                    </div>
                    <div className="flex flex-col">
                      <span className="text-muted-foreground">DEA</span>
                      <span className="font-medium">{etf.macd.dea.toFixed(4)}</span>
                    </div>
                    <div className="flex flex-col">
                      <span className="text-muted-foreground">柱</span>
                      <span className={`font-medium ${etf.macd.macd >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                        {etf.macd.macd.toFixed(4)}
                      </span>
                    </div>
                  </div>
                  {/* MACD信号 */}
                  <div className="pt-2 border-t">
                    {etf.macd.dif > etf.macd.dea && etf.macd.macd > 0 ? (
                        <Badge variant="default" className="flex w-fit items-center gap-1 text-xs bg-green-500">
                          <CircleCheck className="h-3 w-3" aria-hidden="true" />
                          金叉(看涨)
                        </Badge>
                      ) : etf.macd.dif < etf.macd.dea && etf.macd.macd < 0 ? (
                      <Badge variant="secondary" className="flex w-fit items-center gap-1 text-xs bg-red-500 text-white">
                        <CircleX className="h-3 w-3" aria-hidden="true" />
                        死叉(看跌)
                      </Badge>
                    ) : (
                      <Badge variant="outline" className="text-xs">
                        中性
                      </Badge>
                    )}
                  </div>
                </div>
              )}

              {/* 布林带 */}
              {etf.boll && etf.boll.upper != null && etf.boll.mid != null && etf.boll.lower != null && (
                <div className="p-3 rounded-lg bg-muted/50 space-y-2">
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger className="text-xs font-semibold flex items-center gap-1 cursor-help">
                          布林带 (BOLL)
                          <Info className="h-3 w-3 text-muted-foreground" />
                        </TooltipTrigger>
                      <TooltipContent>
                        <p className="max-w-xs text-xs">由上轨、中轨、下轨组成，反映价格波动范围。价格触及上轨可能超买，触及下轨可能超卖。</p>
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                  <div className="space-y-1 text-xs">
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">上轨:</span>
                      <span className="font-medium">{etf.boll.upper.toFixed(3)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">中轨:</span>
                      <span className="font-medium">{etf.boll.mid.toFixed(3)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">下轨:</span>
                      <span className="font-medium">{etf.boll.lower.toFixed(3)}</span>
                    </div>
                  </div>
                  {/* 价格位置 */}
                  {etf.current_price != null && (
                    <div className="pt-2 border-t">
                      <div className="text-xs text-muted-foreground mb-1">当前价格位置:</div>
                      {etf.current_price >= etf.boll.upper ? (
                        <Badge variant="secondary" className="flex w-fit items-center gap-1 text-xs bg-orange-500 text-white">
                          <TriangleAlert className="h-3 w-3" aria-hidden="true" />
                          接近上轨(可能超买)
                        </Badge>
                      ) : etf.current_price <= etf.boll.lower ? (
                        <Badge variant="secondary" className="flex w-fit items-center gap-1 text-xs bg-blue-500 text-white">
                          <TriangleAlert className="h-3 w-3" aria-hidden="true" />
                          接近下轨(可能超卖)
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="text-xs">
                          正常区间
                        </Badge>
                      )}
                    </div>
                  )}
                  {/* 高级指标 */}
                  {(etf.boll.bandwidth != null || etf.boll.percent_b != null) && (
                    <div className="pt-2 border-t space-y-1">
                      {etf.boll.bandwidth != null && (
                        <div className="flex justify-between text-xs">
                          <TooltipProvider>
                            <Tooltip>
                              <TooltipTrigger className="text-muted-foreground cursor-help">
                                带宽:
                              </TooltipTrigger>
                              <TooltipContent>
                                <p className="max-w-xs text-xs">布林带宽度，数值越小表示波动率收窄，可能预示突破。</p>
                              </TooltipContent>
                            </Tooltip>
                          </TooltipProvider>
                          <span className="font-medium">{(etf.boll.bandwidth * 100).toFixed(2)}%</span>
                        </div>
                      )}
                      {etf.boll.percent_b != null && (
                        <div className="flex justify-between text-xs">
                          <TooltipProvider>
                            <Tooltip>
                              <TooltipTrigger className="text-muted-foreground cursor-help">
                                %B位置:
                              </TooltipTrigger>
                              <TooltipContent>
                                <p className="max-w-xs text-xs">价格在布林带中的相对位置。&gt;1 突破上轨，&lt;0 突破下轨，0.5 在中轨。</p>
                              </TooltipContent>
                            </Tooltip>
                          </TooltipProvider>
                          <span className="font-medium">{etf.boll.percent_b.toFixed(2)}</span>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}

              {/* DMI/ADX */}
              {etf.dmi && etf.dmi.pdi != null && etf.dmi.mdi != null && etf.dmi.adx != null && (
                <div className="p-3 rounded-lg bg-muted/50 space-y-2">
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger className="text-xs font-semibold flex items-center gap-1 cursor-help">
                          DMI/ADX
                          <Info className="h-3 w-3 text-muted-foreground" />
                        </TooltipTrigger>
                      <TooltipContent>
                        <p className="max-w-xs text-xs">方向动向指标。PDI(+DI)代表上升动向，MDI(-DI)代表下降动向，ADX衡量趋势强度(大于25为强趋势)。</p>
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                  <div className="grid grid-cols-3 gap-2 text-xs">
                    <div className="flex flex-col">
                      <span className="text-muted-foreground">PDI</span>
                      <span className="font-medium text-green-600">{etf.dmi.pdi.toFixed(2)}</span>
                    </div>
                    <div className="flex flex-col">
                      <span className="text-muted-foreground">MDI</span>
                      <span className="font-medium text-red-600">{etf.dmi.mdi.toFixed(2)}</span>
                    </div>
                    <div className="flex flex-col">
                      <span className="text-muted-foreground">ADX</span>
                      <span className="font-medium">{etf.dmi.adx.toFixed(2)}</span>
                    </div>
                    {etf.dmi.adxr != null && (
                      <div className="flex flex-col">
                        <TooltipProvider>
                          <Tooltip>
                            <TooltipTrigger className="text-muted-foreground cursor-help text-left">
                              ADXR
                            </TooltipTrigger>
                            <TooltipContent>
                              <p className="max-w-xs text-xs">ADX的平滑值，减少假信号。</p>
                            </TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
                        <span className="font-medium">{etf.dmi.adxr.toFixed(2)}</span>
                      </div>
                    )}
                  </div>
                  <div className="pt-2 border-t space-y-1">
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-muted-foreground">趋势方向:</span>
                      {etf.dmi.pdi > etf.dmi.mdi ? (
                        <Badge variant="default" className="text-xs bg-green-500">
                          上升
                        </Badge>
                      ) : (
                        <Badge variant="secondary" className="text-xs bg-red-500 text-white">
                          下降
                        </Badge>
                      )}
                    </div>
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-muted-foreground">趋势强度:</span>
                      {etf.dmi.adx > 25 ? (
                        <Badge variant="default" className="text-xs">
                          强趋势
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="text-xs">
                          弱趋势
                        </Badge>
                      )}
                    </div>
                  </div>
                </div>
              )}

              {/* 稳定性指标 */}
              {(etf.volatility != null || etf.max_drawdown != null) && (
                <div className="p-3 rounded-lg bg-muted/50 space-y-2">
                  <h5 className="text-xs font-semibold">稳定性指标</h5>
                  <div className="space-y-1 text-xs">
                    {etf.volatility != null && (
                      <div className="flex justify-between">
                        <TooltipProvider>
                          <Tooltip>
                            <TooltipTrigger className="text-muted-foreground cursor-help">
                              年化波动率:
                            </TooltipTrigger>
                            <TooltipContent>
                              <p className="max-w-xs text-xs">衡量价格波动程度。数值越高，波动越大，风险越高。</p>
                            </TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
                        <span className="font-medium">{etf.volatility.toFixed(2)}%</span>
                      </div>
                    )}
                    {etf.max_drawdown != null && (
                      <div className="flex justify-between">
                        <TooltipProvider>
                          <Tooltip>
                            <TooltipTrigger className="text-muted-foreground cursor-help">
                              最大回撤:
                            </TooltipTrigger>
                            <TooltipContent>
                              <p className="max-w-xs text-xs">从最高点到最低点的最大跌幅。数值越小，风险控制越好。</p>
                            </TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
                        <span className={`font-medium ${Math.abs(etf.max_drawdown) > 20 ? 'text-red-600' : 'text-green-600'}`}>
                          {etf.max_drawdown.toFixed(2)}%
                        </span>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </TabsContent>

            {/* 动量指标 */}
            <TabsContent value="momentum" className="space-y-3 mt-3">
              {/* RSI */}
              {etf.rsi != null && (
                <div className="p-3 rounded-lg bg-muted/50 space-y-2">
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger className="text-xs font-semibold flex items-center gap-1 cursor-help">
                          相对强弱指标 (RSI)
                          <Info className="h-3 w-3 text-muted-foreground" />
                        </TooltipTrigger>
                      <TooltipContent>
                        <p className="max-w-xs text-xs">衡量价格涨跌力度。RSI &gt; 70 为超买区，RSI &lt; 30 为超卖区。</p>
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                  <div className="space-y-2">
                    <div className="flex justify-between text-xs">
                      <span className="text-muted-foreground">RSI值:</span>
                      <span className={`font-medium ${etf.rsi > 70 ? 'text-orange-600' : etf.rsi < 30 ? 'text-blue-600' : ''}`}>
                        {etf.rsi.toFixed(2)}
                      </span>
                    </div>
                    <Progress value={etf.rsi} className="h-2" />
                    <div className="flex justify-between text-[10px] text-muted-foreground">
                      <span>0 (超卖)</span>
                      <span>50</span>
                      <span>100 (超买)</span>
                    </div>
                  </div>
                  <div className="pt-2 border-t">
                    {etf.rsi > 70 ? (
                      <Badge variant="secondary" className="flex w-fit items-center gap-1 text-xs bg-orange-500 text-white">
                        <TriangleAlert className="h-3 w-3" aria-hidden="true" />
                        超买警告
                      </Badge>
                    ) : etf.rsi < 30 ? (
                      <Badge variant="secondary" className="flex w-fit items-center gap-1 text-xs bg-blue-500 text-white">
                        <TriangleAlert className="h-3 w-3" aria-hidden="true" />
                        超卖警告
                      </Badge>
                    ) : (
                      <Badge variant="outline" className="text-xs">
                        正常区间
                      </Badge>
                    )}
                  </div>
                </div>
              )}

              {/* KDJ */}
              {etf.kdj && etf.kdj.k != null && etf.kdj.d != null && etf.kdj.j != null && (
                <div className="p-3 rounded-lg bg-muted/50 space-y-2">
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger className="text-xs font-semibold flex items-center gap-1 cursor-help">
                          随机指标 (KDJ)
                          <Info className="h-3 w-3 text-muted-foreground" />
                        </TooltipTrigger>
                      <TooltipContent>
                        <p className="max-w-xs text-xs">短期超买超卖指标。K线上穿D线为金叉(买入)，下穿为死叉(卖出)。J值 &gt; 100 超买，J值 &lt; 0 超卖。</p>
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                  <div className="grid grid-cols-3 gap-2 text-xs">
                    <div className="flex flex-col">
                      <span className="text-muted-foreground">K值</span>
                      <span className="font-medium">{etf.kdj.k.toFixed(2)}</span>
                    </div>
                    <div className="flex flex-col">
                      <span className="text-muted-foreground">D值</span>
                      <span className="font-medium">{etf.kdj.d.toFixed(2)}</span>
                    </div>
                    <div className="flex flex-col">
                      <span className="text-muted-foreground">J值</span>
                      <span className={`font-medium ${etf.kdj.j > 100 ? 'text-orange-600' : etf.kdj.j < 0 ? 'text-blue-600' : ''}`}>
                        {etf.kdj.j.toFixed(2)}
                      </span>
                    </div>
                  </div>
                  <div className="pt-2 border-t">
                    {etf.kdj.k > etf.kdj.d ? (
                      <Badge variant="default" className="flex w-fit items-center gap-1 text-xs bg-green-500">
                        <CircleCheck className="h-3 w-3" aria-hidden="true" />
                        金叉(看涨)
                      </Badge>
                    ) : (
                      <Badge variant="secondary" className="flex w-fit items-center gap-1 text-xs bg-red-500 text-white">
                        <CircleX className="h-3 w-3" aria-hidden="true" />
                        死叉(看跌)
                      </Badge>
                    )}
                    {etf.kdj.j > 100 && (
                      <Badge variant="secondary" className="text-xs bg-orange-500 text-white ml-2">
                        超买
                      </Badge>
                    )}
                    {etf.kdj.j < 0 && (
                      <Badge variant="secondary" className="text-xs bg-blue-500 text-white ml-2">
                        超卖
                      </Badge>
                    )}
                  </div>
                </div>
              )}

              {/* CCI */}
              {etf.cci != null && (
                <div className="p-3 rounded-lg bg-muted/50 space-y-2">
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger className="text-xs font-semibold flex items-center gap-1 cursor-help">
                          顺势指标 (CCI)
                          <Info className="h-3 w-3 text-muted-foreground" />
                        </TooltipTrigger>
                      <TooltipContent>
                        <p className="max-w-xs text-xs">衡量价格偏离平均值的程度。CCI &gt; 100 超买，CCI &lt; -100 超卖。</p>
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                  <div className="flex justify-between text-xs">
                    <span className="text-muted-foreground">CCI值:</span>
                    <span className={`font-medium ${etf.cci > 100 ? 'text-orange-600' : etf.cci < -100 ? 'text-blue-600' : ''}`}>
                      {etf.cci.toFixed(2)}
                    </span>
                  </div>
                  <div className="pt-2 border-t">
                    {etf.cci > 100 ? (
                      <Badge variant="secondary" className="flex w-fit items-center gap-1 text-xs bg-orange-500 text-white">
                        <TriangleAlert className="h-3 w-3" aria-hidden="true" />
                        超买区域
                      </Badge>
                    ) : etf.cci < -100 ? (
                      <Badge variant="secondary" className="flex w-fit items-center gap-1 text-xs bg-blue-500 text-white">
                        <TriangleAlert className="h-3 w-3" aria-hidden="true" />
                        超卖区域
                      </Badge>
                    ) : (
                      <Badge variant="outline" className="text-xs">
                        正常区间
                      </Badge>
                    )}
                  </div>
                </div>
              )}

              {/* WR */}
              {etf.wr != null && (
                <div className="p-3 rounded-lg bg-muted/50 space-y-2">
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger className="text-xs font-semibold flex items-center gap-1 cursor-help">
                          威廉指标 (WR)
                          <Info className="h-3 w-3 text-muted-foreground" />
                        </TooltipTrigger>
                      <TooltipContent>
                        <p className="max-w-xs text-xs">衡量超买超卖的摆动指标。WR &gt; -20 超买，WR &lt; -80 超卖。</p>
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                  <div className="flex justify-between text-xs">
                    <span className="text-muted-foreground">WR值:</span>
                    <span className={`font-medium ${etf.wr > -20 ? 'text-orange-600' : etf.wr < -80 ? 'text-blue-600' : ''}`}>
                      {etf.wr.toFixed(2)}
                    </span>
                  </div>
                  <div className="pt-2 border-t">
                    {etf.wr > -20 ? (
                      <Badge variant="secondary" className="flex w-fit items-center gap-1 text-xs bg-orange-500 text-white">
                        <TriangleAlert className="h-3 w-3" aria-hidden="true" />
                        超买区域
                      </Badge>
                    ) : etf.wr < -80 ? (
                      <Badge variant="secondary" className="flex w-fit items-center gap-1 text-xs bg-blue-500 text-white">
                        <TriangleAlert className="h-3 w-3" aria-hidden="true" />
                        超卖区域
                      </Badge>
                    ) : (
                      <Badge variant="outline" className="text-xs">
                        正常区间
                      </Badge>
                    )}
                  </div>
                </div>
              )}
            </TabsContent>

            {/* 成交量指标 */}
            <TabsContent value="volume" className="space-y-3 mt-3">
              {etf.obv != null && (
                <div className="p-3 rounded-lg bg-muted/50 space-y-2">
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger className="text-xs font-semibold flex items-center gap-1 cursor-help">
                          能量潮 (OBV)
                          <Info className="h-3 w-3 text-muted-foreground" />
                        </TooltipTrigger>
                      <TooltipContent>
                        <p className="max-w-xs text-xs">累积成交量指标，反映资金流向。OBV上升表示资金流入，下降表示资金流出。</p>
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                  <div className="flex justify-between text-xs">
                    <span className="text-muted-foreground">OBV值:</span>
                    <span className="font-medium">{etf.obv.toLocaleString()}</span>
                  </div>
                </div>
              )}

              {(etf.vol_ma5 != null || etf.vol_ma20 != null) && (
                <div className="p-3 rounded-lg bg-muted/50 space-y-2">
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger className="text-xs font-semibold flex items-center gap-1 cursor-help">
                          成交量均线
                          <Info className="h-3 w-3 text-muted-foreground" />
                        </TooltipTrigger>
                      <TooltipContent>
                        <p className="max-w-xs text-xs">成交量的移动平均值。量价配合是判断趋势的重要依据。</p>
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                  <div className="space-y-1 text-xs">
                    {etf.vol_ma5 != null && (
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">VOL MA5:</span>
                        <span className="font-medium">{etf.vol_ma5.toLocaleString()}</span>
                      </div>
                    )}
                    {etf.vol_ma20 != null && (
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">VOL MA20:</span>
                        <span className="font-medium">{etf.vol_ma20.toLocaleString()}</span>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* 数据质量提示 */}
              {etf.data_points != null && (
                <div className="p-3 rounded-lg bg-blue-50 dark:bg-blue-950 border border-blue-200 dark:border-blue-800">
                  <div className="flex items-start gap-2">
                    <Info className="h-4 w-4 text-blue-600 dark:text-blue-400 mt-0.5" />
                    <div className="text-xs text-blue-900 dark:text-blue-100">
                      <div className="font-medium">数据说明</div>
                      <div className="mt-1">基于 {etf.data_points} 个交易日数据计算</div>
                      {etf.is_fallback && (
                        <div className="mt-1 text-orange-600 dark:text-orange-400">
                          部分指标使用模拟数据
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )}
            </TabsContent>
          </Tabs>
        </CollapsibleContent>
      </Collapsible>
    )
  }

  // 1. 获取企业发展趋势（两阶段：先获取数据，再生成AI报告）
  const fetchCompanyTrend = async () => {
    const industry = getSelectedIndustry()
    if (!industry) return

    setCompanySection({ loading: true, error: null, data: null })
    setSelectedCompanyReportId(null)
    setCompanyReportGenerating(false)

    try {
      // 阶段1: 获取全部企业数据（不生成AI报告，避免后端AI筛选阻塞）
      const response = await fetch(
        buildAIAnalysisEndpoint(getAIAnalysisModule('company'), selectedIndustry, industry.name, 90, { generateAiReport: false })
      )

      const data = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(data.error || '获取企业数据失败')

      if (!data.success) {
        const stageLabel: Record<string, string> = {
          graph: '图谱读取',
          company_data: '企业数据获取',
          ai_report: 'AI报告生成',
          service: '分析服务',
        }
        const stage = data.stage ? `${stageLabel[data.stage] || data.stage}环节异常：` : ''
        const errorMessage = typeof data.error === 'string' && data.error.trim()
          ? data.error.trim()
          : data.error_code
            ? `服务未返回具体原因（错误码：${data.error_code}）`
            : '服务未返回具体原因'
        throw new Error(`${stage}${errorMessage}`)
      }

      // 前端规则筛选Top10企业（使用现有的综合评分逻辑）
      // 优先使用company_summaries（全部企业），如果不存在再使用top_companies
      const allCompanies = data.company_summaries || data.top_companies || []
      const topCompanies = allCompanies.slice(0, 10) // 取前10家企业
      const topCompanySymbols = topCompanies.map((c: CompanyTrendCompany) => c.symbol).filter(Boolean)

      // 阶段2: 对Top10企业生成AI报告（如果有符号的企业）
      setCompanyReportGenerating(true)
      let trendReport = ''
      if (topCompanySymbols.length > 0) {
        try {
          const aiResponse = await fetch(
            buildAIAnalysisEndpoint(getAIAnalysisModule('company'), selectedIndustry, industry.name, 90, {
              generateAiReport: true,
              topCompanies: topCompanySymbols
            })
          )
          const aiData = await aiResponse.json().catch(() => ({}))
          if (aiResponse.ok && aiData.success) {
            trendReport = aiData.trend_report || ''
          }
        } catch (aiError) {
          console.warn('AI报告生成失败，使用数据模式:', aiError)
          // AI报告生成失败不影响主流程，继续使用数据模式
        }
      }
      setCompanyReportGenerating(false)

      const companyData: CompanyTrend = {
        totalCompanies: data.total_companies || 0,
        analyzedCompanies: data.analyzed_companies || 0,
        topCompanies: topCompanies,
        companySummaries: data.company_summaries || [],
        graph: {
          stageCount: data.graph?.stage_count,
          segmentCount: data.graph?.segment_count,
          companyCount: data.graph?.company_count,
          stages: data.graph?.stages?.map((s: any) => ({
            id: s.id,
            name: s.name,
            segments: s.segments,
            companyCount: s.company_count
          }))
        },
        dataCoverage: {
          graphCompanies: data.data_coverage?.graph_companies,
          fetchedCompanies: data.data_coverage?.fetched_companies,
          analyzedCompanies: data.data_coverage?.analyzed_companies,
          companiesWithAnyData: data.data_coverage?.companies_with_any_data,
          quoteCoverage: data.data_coverage?.quote_coverage,
          financialCoverage: data.data_coverage?.financial_coverage,
          announcementCoverage: data.data_coverage?.announcement_coverage,
          missingSymbol: data.data_coverage?.missing_symbol,
        },
        source: data.source,
        trendReport: trendReport,
      }

      setCompanySection({
        loading: false,
        error: null,
        data: companyData,
      })

      try {
        await saveCompanyReport(industry.id, industry.name, companyData)
      } catch (saveError) {
        setCompanySection((current) => ({
          ...current,
          error: saveError instanceof Error ? saveError.message : '数据已完成，但历史报告保存失败',
        }))
      }
    } catch (err) {
      setCompanySection({
        loading: false,
        error: err instanceof Error ? err.message : '获取企业数据失败',
        data: null
      })
    }
  }

  const saveCompanyReport = async (industryId: string, industryName: string, data: CompanyTrend) => {
    const response = await fetch('/api/analysis/reports', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        type: 'company',
        industryId,
        industryName,
        title: `${industryName} 企业发展趋势分析报告`,
        summary: `基于知识图谱中的 ${data.totalCompanies} 家企业，完成 ${data.analyzedCompanies || 0} 家企业的行情、财报和公告分析`,
        content: data.trendReport,
        data,
      }),
    })
    const payload = await response.json().catch(() => ({}))
    if (!response.ok || payload.success === false || !payload.report?.id) {
      throw new Error(payload.error || '企业分析完成，但报告保存失败')
    }

    const report = payload.report
    const newReport: SavedCompanyReport = {
      id: report.id,
      timestamp: report.createdAt,
      industryId,
      industryName,
      title: report.title || `${industryName} 企业发展趋势分析报告`,
      data,
    }
    setSavedCompanyReports((previous) => [newReport, ...previous.filter((item) => item.id !== newReport.id)].slice(0, 20))
    setSelectedCompanyReportId(newReport.id)
  }

  const loadCompanyReport = (reportId: string) => {
    // 与"资讯与产业链分析"保持一致：历史报告只用于选择和跳转，
    // 不把历史报告的数据重新注入当前分析页，完整内容统一在独立报告页查看。
    if (!savedCompanyReports.some((item) => item.id === reportId)) return
    setSelectedCompanyReportId(reportId)
  }

  // 2. 获取大盘走势
  const fetchMarketTrend = async () => {
    const industry = getSelectedIndustry()
    if (!industry) return

    setMarketSection({ loading: true, error: null, data: null })
    setSelectedReportId(null) // 清除选中的历史报告

    try {
      const response = await fetch(
        buildAIAnalysisEndpoint(getAIAnalysisModule('market'), selectedIndustry, industry.name)
      )

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        throw new Error(errorData.error || 'Failed to fetch market data')
      }

      const data = await response.json()

      if (!data.success) {
        // 包含详细错误信息
        const errorMsg = data.error_detail || data.error || 'Analysis failed'
        throw new Error(errorMsg)
      }

      const marketData = {
        etfAnalysis: data.etf_analysis || [],
        indexAnalysis: data.index_analysis || [],
        marketOverview: data.market_overview || null,
        marketIndices: data.market_indices || [],
        trendReport: data.trend_report
      }

      setMarketSection({
        loading: false,
        error: null,
        data: marketData
      })
      setShowCurrentMarketReport(true)

      // 保存完整报告和结构化依据，成功后将报告ID用于详情页跳转。
      await saveReport(industry.id, industry.name, marketData)

    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : '获取市场数据失败'

      setMarketSection({
        loading: false,
        error: errorMessage,
        data: null
      })
    }
  }

  const saveReport = async (industryId: string, industryName: string, data: MarketTrend) => {
    const response = await fetch('/api/analysis/reports', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        type: 'market',
        industryId,
        industryName,
        title: `${industryName} 大盘趋势分析报告`,
        summary: `基于 ${data.etfAnalysis.length} 个 ETF 和 ${data.indexAnalysis.length} 个指数生成的市场分析报告`,
        content: data.trendReport || `# ${industryName} 大盘趋势分析报告\n\n暂无 AI 报告内容。`,
        data,
      }),
    })
    const payload = await response.json().catch(() => ({}))
    if (!response.ok || payload.success === false || !payload.report?.id) {
      throw new Error(payload.error || '市场分析完成，但报告保存失败')
    }

    const report = payload.report
    const newReport: SavedMarketReport = {
      id: report.id,
      timestamp: report.createdAt,
      industryId,
      industryName,
      title: report.title || `${industryName} 大盘趋势分析报告`,
      data,
    }
    setSavedReports((prev) => [newReport, ...prev.filter((item) => item.id !== newReport.id)].slice(0, 20))
    setSelectedReportId(newReport.id)
    setShowCurrentMarketReport(true)
  }

  // 加载历史报告
  const loadReport = (reportId: string) => {
    const report = savedReports.find(r => r.id === reportId)
    if (report) {
      setMarketSection({
        loading: false,
        error: null,
        data: report.data
      })
      setSelectedReportId(reportId)
      setShowCurrentMarketReport(false)
    }
  }

  // 3. 获取综合分析报告
  const fetchComprehensiveAnalysis = async () => {
    const industry = getSelectedIndustry()
    if (!industry) return

    setComprehensiveSection({ loading: true, error: null, data: null })

    try {
      const response = await fetch(
        buildAIAnalysisEndpoint(getAIAnalysisModule('comprehensive'), selectedIndustry, industry.name)
      )

      if (!response.ok) throw new Error('Failed to fetch comprehensive analysis')

      const data = await response.json()

      if (data.success) {
        setComprehensiveSection({
          loading: false,
          error: null,
          data: data.comprehensive_report
        })
      } else {
        throw new Error(data.error || 'Analysis failed')
      }
    } catch (err) {
      setComprehensiveSection({
        loading: false,
        error: err instanceof Error ? err.message : '生成综合分析失败',
        data: null
      })
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
      {industriesError && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <span>{industriesError}</span>
            <Button
              variant="outline"
              size="sm"
              onClick={() => window.location.reload()}
              className="shrink-0"
            >
              刷新重试
            </Button>
          </AlertDescription>
        </Alert>
      )}

      {/* 产业选择 */}
      <Card>
        <CardHeader>
          <CardTitle>选择分析领域</CardTitle>
          <CardDescription>
            选择要分析的产业领域，系统将综合新闻资讯、企业发展趋势和大盘走势进行独立分析
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Select value={selectedIndustry} onValueChange={(v) => setSelectedIndustry(v || '')}>
            <SelectTrigger className="w-full">
              <SelectValue placeholder="选择产业领域">
                {getSelectedIndustry()?.name || '选择产业领域'}
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              {industries.map((industry) => (
                <SelectItem key={industry.id} value={industry.id}>
                  {industry.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          {industries.length === 0 && (
            <Alert>
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>
                暂无可用的产业图谱。请先在知识图谱页面创建产业图谱。
              </AlertDescription>
            </Alert>
          )}
        </CardContent>
      </Card>

      {/* 大盘趋势分析 */}
      <AnalysisModuleCard
        icon={TrendingUp}
        title={getAIAnalysisModule('market').title}
        description={getAIAnalysisModule('market').description}
        canAnalyze={Boolean(selectedIndustry)}
        loading={marketSection.loading}
        hasResult={Boolean(marketData)}
        error={marketSection.error}
        onAnalyze={fetchMarketTrend}
        steps={[
          { icon: Activity, label: '市场数据', detail: '匹配 ETF 与指数行情', active: Boolean(marketData) },
          { icon: TrendingUp, label: '技术指标', detail: '计算均线、动量与波动', active: Boolean(marketData) },
          { icon: FileText, label: 'AI分析报告', detail: '总结趋势、机会与风险', active: Boolean(marketData?.trendReport) },
        ]}
        loadingMessage="正在匹配标的、计算技术指标并生成市场报告..."
        reportTitle="AI大盘趋势分析报告"
        reportBadge="基于当前领域数据"
        reportDescription="报告已经生成，点击查看完整报告了解指数、ETF数据和AI趋势结论。"
        reportReady={Boolean(marketData && showCurrentMarketReport && selectedReportId)}
        onOpenReport={() => {
          const industry = getSelectedIndustry()
          if (!industry || !selectedReportId) return
          router.push(`/analysis/market-report?reportId=${selectedReportId}&industryId=${selectedIndustry}&industryName=${encodeURIComponent(industry.name)}`)
        }}
        history={{
          label: '历史大盘报告',
          value: selectedReportId ?? '',
          placeholder: '选择历史大盘趋势报告',
          options: savedReports.map((report) => ({
            id: report.id,
            label: `${getMarketReportTitle(report)} · ${new Date(report.timestamp).toLocaleString('zh-CN', {
              month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit',
            })}`,
          })),
          onChange: (value) => value && loadReport(value),
          onOpen: () => {
            const industry = getSelectedIndustry()
            if (!industry || !selectedReportId) return
            router.push(`/analysis/market-report?reportId=${selectedReportId}&industryId=${selectedIndustry}&industryName=${encodeURIComponent(industry.name)}`)
          },
        }}
        emptyTitle="点击开始分析获取大盘趋势解读"
        emptyDescription="分析完成后，可在完整报告中查看市场数据和分析结论"
      />

      {/* 资讯与产业链分析 */}
      {getSelectedIndustry() && (
        <NewsAnalysisSection
          key={selectedIndustry}
          industryId={selectedIndustry}
          industryName={getSelectedIndustry()!.name}
        />
      )}

      {/* 企业发展趋势 */}
      <AnalysisModuleCard
        icon={Building2}
        title={getAIAnalysisModule('company').title}
        description={getAIAnalysisModule('company').description}
        canAnalyze={Boolean(selectedIndustry)}
        loading={companySection.loading}
        hasResult={Boolean(companySection.data)}
        error={companySection.error}
        onAnalyze={fetchCompanyTrend}
        steps={[
          { icon: Network, label: '知识图谱企业', detail: '读取产业阶段、环节与全部企业', active: Boolean(companySection.data?.graph) },
          { icon: Newspaper, label: '企业级资讯', detail: '汇总行情、财报与公告信息', active: Boolean(companySection.data?.dataCoverage) },
          { icon: BarChart3, label: '指标与对比', detail: '计算覆盖度、增长与综合评分', active: Boolean(companySection.data?.analyzedCompanies) },
          { icon: FileText, label: 'AI分析报告', detail: '生成可追溯的完整趋势报告', active: Boolean(companySection.data?.trendReport) },
        ]}
        loadingMessage="正在读取企业图谱、整理行情财报并生成趋势报告..."
        reportTitle="AI企业发展趋势分析报告"
        reportBadge="AI生成"
        reportDescription="报告已经生成，点击查看完整报告进入独立页面查看完整企业数据、产业链上下文和AI趋势结论。"
        reportReady={Boolean(companySection.data && selectedCompanyReportId && !companyReportGenerating)}
        onOpenReport={() => selectedCompanyReportId && router.push(`/analysis/report/${selectedCompanyReportId}`)}
        history={{
          label: '历史企业趋势报告',
          value: selectedCompanyReportId ?? '',
          placeholder: '选择历史企业发展趋势报告',
          options: savedCompanyReports.map((report) => ({
            id: report.id,
            label: `${getCompanyReportTitle(report)} · ${new Date(report.timestamp).toLocaleString('zh-CN', {
              month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit',
            })}`,
          })),
          onChange: (value) => value && loadCompanyReport(value),
          onOpen: () => selectedCompanyReportId && router.push(`/analysis/report/${selectedCompanyReportId}`),
        }}
        emptyTitle="点击开始分析获取企业发展趋势解读"
        emptyDescription="分析过程会读取知识图谱企业，并整理行情、财报和公告数据"
      />

      {/* 旧版企业分析内容保留在代码中，待完整报告页稳定后移除。 */}
      <Card className="hidden">
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Building2 className="h-5 w-5" />
              <CardTitle>企业发展趋势</CardTitle>
              <Dialog>
                <DialogTrigger className="inline-flex items-center justify-center h-6 w-6 rounded-md hover:bg-accent hover:text-accent-foreground transition-colors">
                  <Info className="h-4 w-4 text-muted-foreground" />
                </DialogTrigger>
                <DialogContent className="max-w-3xl max-h-[80vh] overflow-y-auto">
                  <DialogHeader>
                    <DialogTitle>企业发展趋势分析处理流程</DialogTitle>
                    <DialogDescription>
                      系统如何分析产业链相关企业的综合表现
                    </DialogDescription>
                  </DialogHeader>
                  <div className="space-y-4 text-sm">
                    <div className="space-y-2">
                      <h4 className="font-semibold flex items-center gap-2">
                        <span className="flex h-6 w-6 items-center justify-center rounded-full bg-primary text-primary-foreground text-xs">1</span>
                        获取产业节点
                      </h4>
                      <p className="text-muted-foreground ml-8">
                        从现行知识图谱结构读取指定产业的全部阶段和环节：
                      </p>
                      <div className="ml-8 p-3 bg-muted rounded-md">
                        <code className="text-xs">
                          MATCH (i:Industry)-[:HAS_STAGE]-&gt;(stage:Stage)<br />
                          -[:HAS_SEGMENT]-&gt;(segment:Segment)<br />
                          WHERE i.id = $industry_id<br />
                          RETURN stage.name, segment.name, segment.code
                        </code>
                      </div>
                      <p className="text-muted-foreground ml-8 mt-2">
                        获取产业泳道图中的阶段/环节，保留企业所属的图谱位置。
                      </p>
                    </div>

                    <div className="space-y-2">
                      <h4 className="font-semibold flex items-center gap-2">
                        <span className="flex h-6 w-6 items-center justify-center rounded-full bg-primary text-primary-foreground text-xs">2</span>
                        提取关联企业
                      </h4>
                      <p className="text-muted-foreground ml-8">
                        遍历每个环节，获取其下配置的全部企业：
                      </p>
                      <div className="ml-8 p-3 bg-muted rounded-md">
                        <code className="text-xs">
                          MATCH (i:Industry)-[:HAS_STAGE]-&gt;(:Stage)<br />
                          -[:HAS_SEGMENT]-&gt;(segment:Segment)<br />
                          -[:INCLUDES]-&gt;(c:Company)<br />
                          WHERE i.id = $industry_id<br />
                          RETURN c.ticker, c.name, segment.name
                        </code>
                      </div>
                      <p className="text-muted-foreground ml-8 mt-2">
                        对所有企业去重处理，得到该产业涉及的唯一企业列表
                      </p>
                    </div>

                    <div className="space-y-2">
                      <h4 className="font-semibold flex items-center gap-2">
                        <span className="flex h-6 w-6 items-center justify-center rounded-full bg-primary text-primary-foreground text-xs">3</span>
                        批量获取企业数据
                      </h4>
                      <p className="text-muted-foreground ml-8">
                        对每个企业并行获取多维度数据（分析周期默认90天）：
                      </p>
                      <div className="ml-8 grid grid-cols-2 gap-2">
                        <div className="p-2 bg-muted rounded-md">
                          <div className="font-medium text-xs mb-1">基本信息</div>
                          <ul className="text-xs text-muted-foreground space-y-0.5">
                            <li>• 股票代码、名称</li>
                            <li>• 所属市场（A股/港股/美股）</li>
                            <li>• 行业分类、概念标签</li>
                          </ul>
                        </div>
                        <div className="p-2 bg-muted rounded-md">
                          <div className="font-medium text-xs mb-1">K线数据</div>
                          <ul className="text-xs text-muted-foreground space-y-0.5">
                            <li>• 日K线（开高低收）</li>
                            <li>• 成交量、成交额</li>
                            <li>• 前复权处理</li>
                          </ul>
                        </div>
                        <div className="p-2 bg-muted rounded-md">
                          <div className="font-medium text-xs mb-1">财报数据</div>
                          <ul className="text-xs text-muted-foreground space-y-0.5">
                            <li>• 营业收入</li>
                            <li>• 净利润</li>
                            <li>• 同比/环比增长率</li>
                          </ul>
                        </div>
                        <div className="p-2 bg-muted rounded-md">
                          <div className="font-medium text-xs mb-1">公告信息</div>
                          <ul className="text-xs text-muted-foreground space-y-0.5">
                            <li>• 公告标题和日期</li>
                            <li>• 重大事项标记</li>
                            <li>• 业绩预告/增持/回购等</li>
                          </ul>
                        </div>
                      </div>
                    </div>

                    <div className="space-y-2">
                      <h4 className="font-semibold flex items-center gap-2">
                        <span className="flex h-6 w-6 items-center justify-center rounded-full bg-primary text-primary-foreground text-xs">4</span>
                        计算关键指标
                      </h4>
                      <p className="text-muted-foreground ml-8">
                        对每个企业计算多维度分析指标：
                      </p>
                      <div className="ml-8 space-y-2">
                        <div className="p-2 bg-muted rounded-md">
                          <div className="font-medium text-xs mb-1">价格指标</div>
                          <ul className="text-xs text-muted-foreground space-y-0.5">
                            <li>• 期间涨跌幅 = (最新价 - 期初价) / 期初价 × 100%</li>
                            <li>• 年化波动率 = 日收益率标准差 × √252</li>
                            <li>• 最大回撤 = max((当前价 - 期间最高价) / 期间最高价)</li>
                          </ul>
                        </div>
                        <div className="p-2 bg-muted rounded-md">
                          <div className="font-medium text-xs mb-1">财务指标</div>
                          <ul className="text-xs text-muted-foreground space-y-0.5">
                            <li>• 营收增长率 = (最新季度营收 - 去年同期) / 去年同期 × 100%</li>
                            <li>• 利润增长率 = (最新季度利润 - 去年同期) / 去年同期 × 100%</li>
                          </ul>
                        </div>
                        <div className="p-2 bg-muted rounded-md">
                          <div className="font-medium text-xs mb-1">公告指标</div>
                          <ul className="text-xs text-muted-foreground space-y-0.5">
                            <li>• 公告总数统计</li>
                            <li>• 重要公告识别（关键词：重大/业绩/增持/回购）</li>
                          </ul>
                        </div>
                      </div>
                    </div>

                    <div className="space-y-2">
                      <h4 className="font-semibold flex items-center gap-2">
                        <span className="flex h-6 w-6 items-center justify-center rounded-full bg-primary text-primary-foreground text-xs">5</span>
                        综合评分与排序
                      </h4>
                      <p className="text-muted-foreground ml-8">
                        采用多维度评分体系（总分100分）识别头部企业：
                      </p>
                      <div className="ml-8 space-y-2">
                        <div className="flex items-start gap-2 p-2 bg-muted rounded-md">
                          <Badge variant="secondary" className="text-xs">30分</Badge>
                          <div className="text-xs">
                            <div className="font-medium">价格表现</div>
                            <div className="text-muted-foreground">涨幅&gt;20%得30分，&gt;10%得20分，&gt;0%得10分</div>
                          </div>
                        </div>
                        <div className="flex items-start gap-2 p-2 bg-muted rounded-md">
                          <Badge variant="secondary" className="text-xs">40分</Badge>
                          <div className="text-xs">
                            <div className="font-medium">财报表现</div>
                            <div className="text-muted-foreground">营收增长&gt;20%得20分，利润增长&gt;20%得20分</div>
                          </div>
                        </div>
                        <div className="flex items-start gap-2 p-2 bg-muted rounded-md">
                          <Badge variant="secondary" className="text-xs">20分</Badge>
                          <div className="text-xs">
                            <div className="font-medium">稳定性</div>
                            <div className="text-muted-foreground">低波动率(&lt;30%)且低回撤(&lt;20%)得20分</div>
                          </div>
                        </div>
                        <div className="flex items-start gap-2 p-2 bg-muted rounded-md">
                          <Badge variant="secondary" className="text-xs">10分</Badge>
                          <div className="text-xs">
                            <div className="font-medium">公告活跃度</div>
                            <div className="text-muted-foreground">重要公告&gt;3条得10分，&gt;0条得5分</div>
                          </div>
                        </div>
                      </div>
                      <p className="text-muted-foreground ml-8 mt-2">
                        按综合得分降序排列，展示Top 10头部企业
                      </p>
                    </div>

                    <div className="space-y-2">
                      <h4 className="font-semibold flex items-center gap-2">
                        <span className="flex h-6 w-6 items-center justify-center rounded-full bg-primary text-primary-foreground text-xs">6</span>
                        AI生成趋势报告
                      </h4>
                      <p className="text-muted-foreground ml-8">
                        将企业分析数据提交给Claude AI生成专业投资分析报告：
                      </p>
                      <ul className="ml-8 space-y-1 list-disc list-inside text-muted-foreground">
                        <li>整体行业景气度评估</li>
                        <li>头部企业发展态势分析</li>
                        <li>财务健康度综合判断</li>
                        <li>关键风险因素识别</li>
                        <li>未来发展展望</li>
                      </ul>
                    </div>

                    <div className="p-3 bg-blue-50 dark:bg-blue-950 rounded-md border border-blue-200 dark:border-blue-800">
                      <div className="flex items-start gap-2">
                        <AlertCircle className="h-4 w-4 text-blue-600 dark:text-blue-400 mt-0.5" />
                        <div className="text-xs text-blue-900 dark:text-blue-100">
                          <div className="font-medium mb-1">数据准确性</div>
                          <div>企业数据来源于AKShare，财报数据通常延迟1-2个交易日。综合评分算法基于量化指标，仅供参考，不构成投资建议。</div>
                        </div>
                      </div>
                    </div>
                  </div>
                </DialogContent>
              </Dialog>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={fetchCompanyTrend}
              disabled={companySection.loading || !selectedIndustry}
            >
              {companySection.loading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  分析中
                </>
              ) : (
                <>
                  <Building2 className="mr-2 h-4 w-4" />
                  开始分析
                </>
              )}
            </Button>
          </div>
          <CardDescription>
            分析产业链相关企业发展趋势，识别头部企业动态
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-2 md:grid-cols-4">
            {[
              { icon: Network, label: '知识图谱企业', detail: '读取产业阶段、环节与全部企业' },
              { icon: Newspaper, label: '企业级资讯', detail: '汇总行情、财报与公告信息' },
              { icon: BarChart3, label: '指标与对比', detail: '计算覆盖度、增长与综合评分' },
              { icon: FileText, label: 'AI分析报告', detail: '生成可追溯的完整趋势报告' },
            ].map((step, index) => {
              const Icon = step.icon
              const active = companySection.loading
                || (index === 0 && companySection.data?.graph)
                || (index === 1 && companySection.data?.dataCoverage)
                || (index === 2 && companySection.data?.analyzedCompanies)
                || (index === 3 && companySection.data?.trendReport)

              return (
                <div
                  key={step.label}
                  className={`rounded-lg border p-3 transition-colors ${active ? 'border-primary/40 bg-primary/5' : 'bg-muted/30'}`}
                >
                  <div className="flex items-center gap-2">
                    <Icon className={`h-4 w-4 ${active ? 'text-primary' : 'text-muted-foreground'}`} />
                    <span className="text-sm font-medium">{index + 1}. {step.label}</span>
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">{step.detail}</p>
                </div>
              )
            })}
          </div>

          {savedCompanyReports.length > 0 && (
            <div className="flex flex-col gap-2 rounded-lg border bg-muted/20 p-3 sm:flex-row sm:items-center">
              <div className="flex-1">
                <div className="mb-1 text-xs font-medium text-muted-foreground">历史报告</div>
                <Select value={selectedCompanyReportId ?? ''} onValueChange={(value) => value && loadCompanyReport(value)}>
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="选择历史企业发展趋势报告">
                      {savedCompanyReports.find((report) => report.id === selectedCompanyReportId)
                        ? `${getCompanyReportTitle(savedCompanyReports.find((report) => report.id === selectedCompanyReportId)!)} · ${new Date(savedCompanyReports.find((report) => report.id === selectedCompanyReportId)!.timestamp).toLocaleString('zh-CN', {
                          month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit'
                        })}`
                        : undefined}
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    {savedCompanyReports.map((report) => (
                      <SelectItem key={report.id} value={report.id}>
                        {getCompanyReportTitle(report)} · {new Date(report.timestamp).toLocaleString('zh-CN', {
                          month: '2-digit',
                          day: '2-digit',
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <Button
                variant="outline"
                className="shrink-0 gap-2"
                onClick={() => selectedCompanyReportId && router.push(`/analysis/report/${selectedCompanyReportId}`)}
                disabled={!selectedCompanyReportId}
              >
                <FileText className="h-4 w-4" />
                查看报告
              </Button>
            </div>
          )}

          {companySection.loading && (
            <div className="space-y-2">
              <Skeleton className="h-20 w-full" />
              <Skeleton className="h-20 w-full" />
            </div>
          )}
          {companySection.error && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>{companySection.error}</AlertDescription>
            </Alert>
          )}
          {companySection.data && (
              <div className="rounded-lg border border-primary/20 bg-primary/[0.03] p-4 sm:p-5">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex items-center gap-2">
                    <FileText className="h-4 w-4 text-primary" />
                    <h4 className="text-sm font-semibold">AI企业发展趋势分析报告</h4>
                    <Badge variant="secondary">AI生成</Badge>
                  </div>
                  <Button
                    size="sm"
                    className="gap-2"
                    onClick={() => selectedCompanyReportId && router.push(`/analysis/report/${selectedCompanyReportId}`)}
                    disabled={!selectedCompanyReportId}
                  >
                    <FileText className="h-4 w-4" />
                    查看完整报告
                  </Button>
                </div>
                <p className="mt-3 text-sm leading-6 text-muted-foreground">
                  报告已经生成，点击查看完整报告进入独立页面查看完整企业数据、产业链上下文和AI趋势结论。
                </p>
              </div>
          )}
          {!companySection.loading && !companySection.data && !companySection.error && (
            <div className="rounded-lg border border-dashed py-10 text-center">
              <Sparkles className="mx-auto h-8 w-8 text-muted-foreground" />
              <p className="mt-3 text-sm font-medium">点击开始分析获取企业发展趋势解读</p>
              <p className="mt-1 text-xs text-muted-foreground">分析过程会读取知识图谱企业，并整理行情、财报和公告数据</p>
            </div>
          )}
        </CardContent>
      </Card>

      {false && <>
      {/* 综合投资分析（已移至综合分析 Tab） */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <BarChart3 className="h-5 w-5" />
              <CardTitle>{getAIAnalysisModule('comprehensive').title}</CardTitle>
              <Dialog>
                <DialogTrigger className="inline-flex items-center justify-center h-6 w-6 rounded-md hover:bg-accent hover:text-accent-foreground transition-colors">
                  <Info className="h-4 w-4 text-muted-foreground" />
                </DialogTrigger>
                <DialogContent className="max-w-3xl max-h-[80vh] overflow-y-auto">
                  <DialogHeader>
                    <DialogTitle>综合投资分析处理流程</DialogTitle>
                    <DialogDescription>
                      系统如何整合多维度数据生成综合投资分析报告
                    </DialogDescription>
                  </DialogHeader>
                  <div className="space-y-4 text-sm">
                    <div className="space-y-2">
                      <h4 className="font-semibold flex items-center gap-2">
                        <span className="flex h-6 w-6 items-center justify-center rounded-full bg-primary text-primary-foreground text-xs">1</span>
                        并行执行三大分析
                      </h4>
                      <p className="text-muted-foreground ml-8">
                        使用asyncio.gather并发执行三个独立的分析任务，提高效率：
                      </p>
                      <div className="ml-8 grid grid-cols-3 gap-2">
                        <div className="p-2 bg-muted rounded-md">
                          <div className="font-medium text-xs mb-1 flex items-center gap-1">
                            <Building2 className="h-3 w-3" />
                            企业分析
                          </div>
                          <ul className="text-xs text-muted-foreground space-y-0.5">
                            <li>• 获取产业企业</li>
                            <li>• 计算综合评分</li>
                            <li>• 识别头部企业</li>
                          </ul>
                        </div>
                        <div className="p-2 bg-muted rounded-md">
                          <div className="font-medium text-xs mb-1 flex items-center gap-1">
                            <TrendingUp className="h-3 w-3" />
                            大盘分析
                          </div>
                          <ul className="text-xs text-muted-foreground space-y-0.5">
                            <li>• 匹配ETF/指数</li>
                            <li>• 计算技术指标</li>
                            <li>• 判断市场趋势</li>
                          </ul>
                        </div>
                        <div className="p-2 bg-muted rounded-md">
                          <div className="font-medium text-xs mb-1 flex items-center gap-1">
                            <Newspaper className="h-3 w-3" />
                            新闻分析
                          </div>
                          <ul className="text-xs text-muted-foreground space-y-0.5">
                            <li>• 采集新闻资讯</li>
                            <li>• 关键词过滤</li>
                            <li>• 提取前5条</li>
                          </ul>
                        </div>
                      </div>
                      <div className="ml-8 p-3 bg-muted rounded-md mt-2">
                        <code className="text-xs">
                          company_result, market_result, news_result = await asyncio.gather(<br />
                          &nbsp;&nbsp;company_analyzer.analyze(...),<br />
                          &nbsp;&nbsp;market_analyzer.analyze(...),<br />
                          &nbsp;&nbsp;get_industry_news(...)<br />
                          )
                        </code>
                      </div>
                    </div>

                    <div className="space-y-2">
                      <h4 className="font-semibold flex items-center gap-2">
                        <span className="flex h-6 w-6 items-center justify-center rounded-full bg-primary text-primary-foreground text-xs">2</span>
                        数据聚合与结构化
                      </h4>
                      <p className="text-muted-foreground ml-8">
                        整合三个分析任务的结果，构建完整的分析上下文：
                      </p>
                      <div className="ml-8 space-y-2">
                        <div className="p-2 bg-muted rounded-md">
                          <div className="font-medium text-xs mb-1">企业数据（如果成功）</div>
                          <ul className="text-xs text-muted-foreground space-y-0.5">
                            <li>• 企业总数、头部企业列表（Top 10）</li>
                            <li>• 平均涨跌幅、上涨企业占比</li>
                            <li>• 已生成的企业趋势报告</li>
                          </ul>
                        </div>
                        <div className="p-2 bg-muted rounded-md">
                          <div className="font-medium text-xs mb-1">市场数据（如果成功）</div>
                          <ul className="text-xs text-muted-foreground space-y-0.5">
                            <li>• ETF列表及表现（涨跌幅、趋势、技术指标）</li>
                            <li>• 指数列表及表现（点位变化、MA均线）</li>
                            <li>• 已生成的市场趋势报告</li>
                          </ul>
                        </div>
                        <div className="p-2 bg-muted rounded-md">
                          <div className="font-medium text-xs mb-1">新闻数据</div>
                          <ul className="text-xs text-muted-foreground space-y-0.5">
                            <li>• 前5条相关新闻（标题、摘要、来源、时间）</li>
                            <li>• 行业最新动态和热点事件</li>
                          </ul>
                        </div>
                      </div>
                    </div>

                    <div className="space-y-2">
                      <h4 className="font-semibold flex items-center gap-2">
                        <span className="flex h-6 w-6 items-center rounded-full bg-primary text-primary-foreground text-xs flex items-center justify-center">3</span>
                        生成综合报告
                      </h4>
                      <p className="text-muted-foreground ml-8">
                        将聚合数据按照标准模板组装成综合分析报告：
                      </p>
                      <div className="ml-8 space-y-2">
                        <div className="p-2 bg-muted rounded-md">
                          <div className="font-medium text-xs mb-1">报告结构</div>
                          <ul className="text-xs text-muted-foreground space-y-0.5">
                            <li>• 一、企业发展趋势（来自企业分析报告）</li>
                            <li>• 二、市场趋势分析（来自市场分析报告）</li>
                            <li>• 三、最新行业资讯（新闻标题+摘要前100字）</li>
                            <li>• 四、综合评估（标准模板结论）</li>
                          </ul>
                        </div>
                        <div className="p-2 bg-amber-50 dark:bg-amber-950 rounded-md border border-amber-200 dark:border-amber-800">
                          <div className="text-xs text-amber-900 dark:text-amber-100">
                            <div className="font-medium mb-1">容错机制</div>
                            <div>如果企业分析或市场分析失败，仍会使用成功的部分生成报告。至少需要一个分析成功才能返回结果。</div>
                          </div>
                        </div>
                      </div>
                    </div>

                    <div className="space-y-2">
                      <h4 className="font-semibold flex items-center gap-2">
                        <span className="flex h-6 w-6 items-center justify-center rounded-full bg-primary text-primary-foreground text-xs">4</span>
                        报告内容展示
                      </h4>
                      <p className="text-muted-foreground ml-8">
                        系统会将分析结果整理成清晰易读的报告，方便查看重点结论：
                      </p>
                      <ul className="ml-8 space-y-1 list-disc list-inside text-muted-foreground">
                        <li>重点结论、趋势和风险清晰呈现</li>
                        <li>保留清晰的段落和层次结构</li>
                        <li>适配深色模式，阅读更舒适</li>
                        <li>限制内容宽度，确保阅读体验</li>
                      </ul>
                    </div>

                    <div className="space-y-2">
                      <h4 className="font-semibold">报告内容示例</h4>
                      <div className="ml-8 p-3 bg-muted rounded-md text-xs space-y-2">
                        <div>
                          <div className="font-medium"># AI芯片 产业综合分析</div>
                        </div>
                        <div>
                          <div className="font-medium">## 一、企业发展趋势</div>
                          <div className="text-muted-foreground mt-1">
                            分析期内共覆盖45家产业链企业，平均涨跌幅+12.3%。头部企业中，英伟达涨幅达35%，台积电涨幅28%...
                          </div>
                        </div>
                        <div>
                          <div className="font-medium">## 二、市场趋势分析</div>
                          <div className="text-muted-foreground mt-1">
                            相关ETF表现强劲，AI芯片ETF(159995)期间涨幅18.5%，半导体ETF(512480)涨幅15.2%...
                          </div>
                        </div>
                        <div>
                          <div className="font-medium">## 三、最新行业资讯</div>
                          <div className="text-muted-foreground mt-1">
                            1. 英伟达发布新一代AI芯片架构...<br />
                            2. 国内AI芯片企业获得新一轮融资...<br />
                            3. 行业标准制定进入关键阶段...
                          </div>
                        </div>
                        <div>
                          <div className="font-medium">## 四、综合评估</div>
                          <div className="text-muted-foreground mt-1">
                            基于以上分析，该产业处于快速发展期，建议投资者关注头部企业动态...
                          </div>
                        </div>
                      </div>
                    </div>

                    <div className="p-3 bg-blue-50 dark:bg-blue-950 rounded-md border border-blue-200 dark:border-blue-800">
                      <div className="flex items-start gap-2">
                        <AlertCircle className="h-4 w-4 text-blue-600 dark:text-blue-400 mt-0.5" />
                        <div className="text-xs text-blue-900 dark:text-blue-100">
                          <div className="font-medium mb-1">性能优化</div>
                          <div>三个分析任务并行执行，总耗时约为最慢任务的时间（通常3-8秒），而非串行执行的时间总和（可能15-30秒）。企业分析和市场分析已经包含AI生成的专业报告，综合报告直接整合无需二次调用AI。</div>
                        </div>
                      </div>
                    </div>
                  </div>
                </DialogContent>
              </Dialog>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={fetchComprehensiveAnalysis}
              disabled={comprehensiveSection.loading || !selectedIndustry}
            >
              {comprehensiveSection.loading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  分析中
                </>
              ) : (
                <>
                  <BarChart3 className="mr-2 h-4 w-4" />
                  开始分析
                </>
              )}
            </Button>
          </div>
          <CardDescription>
            基于企业发展、市场趋势和新闻资讯的AI综合分析
          </CardDescription>
        </CardHeader>
        <CardContent>
          {comprehensiveSection.loading && (
            <div className="space-y-2">
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-3/4" />
            </div>
          )}
          {comprehensiveSection.error && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>{comprehensiveSection.error}</AlertDescription>
            </Alert>
          )}
          {comprehensiveSection.data && (
            <div className="prose prose-sm max-w-none dark:prose-invert">
              <div className="whitespace-pre-wrap">{comprehensiveSection.data}</div>
            </div>
          )}
          {!comprehensiveSection.loading && !comprehensiveSection.data && !comprehensiveSection.error && (
            <div className="text-sm text-muted-foreground text-center py-8">
              点击右上角"开始分析"按钮生成综合投资分析报告
            </div>
          )}
        </CardContent>
      </Card>
      </>}
    </div>
  )
}
