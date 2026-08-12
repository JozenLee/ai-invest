'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Badge } from '@/components/ui/badge'
import { Loader2, TrendingUp, TrendingDown, AlertCircle, BarChart3, Building2, Newspaper, RefreshCw, Info, ChevronDown, ChevronUp, FileText } from 'lucide-react'
import { Skeleton } from '@/components/ui/skeleton'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { Progress } from '@/components/ui/progress'

interface Industry {
  id: string
  name: string
  description?: string
}

interface CompanyTrend {
  totalCompanies: number
  topCompanies: Array<{
    name: string
    symbol: string
    priceChangePct: number
    compositeScore: number
  }>
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
  trendReport: string
}

interface NewsItem {
  title: string
  summary: string
  published_at: string
  source: string
  url?: string
}

interface AnalysisSection {
  loading: boolean
  error: string | null
  data: any
}

interface MarketReport {
  id: string
  timestamp: string
  industryId: string
  industryName: string
  data: MarketTrend
}

export function IndustryAnalysis() {
  const router = useRouter()
  const [industries, setIndustries] = useState<Industry[]>([])
  const [selectedIndustry, setSelectedIndustry] = useState<string>('')
  const [loadingIndustries, setLoadingIndustries] = useState(true)
  const [expandedETFs, setExpandedETFs] = useState<Set<string>>(new Set())

  // 报告缓存（最多保存5份）
  const [savedReports, setSavedReports] = useState<MarketReport[]>([])
  const [selectedReportId, setSelectedReportId] = useState<string | null>(null)

  // 从 localStorage 加载历史报告
  useEffect(() => {
    try {
      const stored = localStorage.getItem('market_reports')
      if (stored) {
        const reports = JSON.parse(stored) as MarketReport[]
        setSavedReports(reports)
      }
    } catch (err) {
      console.error('Failed to load saved reports:', err)
    }
  }, [])

  // 各分析模块的独立状态
  const [newsSection, setNewsSection] = useState<AnalysisSection>({
    loading: false,
    error: null,
    data: null
  })
  const [companySection, setCompanySection] = useState<AnalysisSection>({
    loading: false,
    error: null,
    data: null
  })
  const [marketSection, setMarketSection] = useState<AnalysisSection>({
    loading: false,
    error: null,
    data: null
  })
  const [comprehensiveSection, setComprehensiveSection] = useState<AnalysisSection>({
    loading: false,
    error: null,
    data: null
  })

  // 加载产业列表
  useEffect(() => {
    async function loadIndustries() {
      try {
        const response = await fetch('/api/graph/industries')
        if (!response.ok) throw new Error('Failed to load industries')

        const result = await response.json()
        if (result.success && result.data && Array.isArray(result.data)) {
          setIndustries(result.data)
          if (result.data.length > 0) {
            setSelectedIndustry(result.data[0].id)
          }
        }
      } catch (err) {
        console.error('Error loading industries:', err)
      } finally {
        setLoadingIndustries(false)
      }
    }

    loadIndustries()
  }, [])

  const getSelectedIndustry = () => {
    return industries.find(i => i.id === selectedIndustry)
  }

  const toggleETF = (code: string) => {
    setExpandedETFs(prev => {
      const next = new Set(prev)
      if (next.has(code)) {
        next.delete(code)
      } else {
        next.add(code)
      }
      return next
    })
  }

  // 渲染技术指标详情
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
                      <Badge variant="default" className="text-xs bg-green-500">
                        🟢 金叉(看涨)
                      </Badge>
                    ) : etf.macd.dif < etf.macd.dea && etf.macd.macd < 0 ? (
                      <Badge variant="secondary" className="text-xs bg-red-500 text-white">
                        🔴 死叉(看跌)
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
                        <Badge variant="secondary" className="text-xs bg-orange-500 text-white">
                          ⚠️ 接近上轨(可能超买)
                        </Badge>
                      ) : etf.current_price <= etf.boll.lower ? (
                        <Badge variant="secondary" className="text-xs bg-blue-500 text-white">
                          ⚠️ 接近下轨(可能超卖)
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
                      <Badge variant="secondary" className="text-xs bg-orange-500 text-white">
                        ⚠️ 超买警告
                      </Badge>
                    ) : etf.rsi < 30 ? (
                      <Badge variant="secondary" className="text-xs bg-blue-500 text-white">
                        ⚠️ 超卖警告
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
                      <Badge variant="default" className="text-xs bg-green-500">
                        🟢 金叉(看涨)
                      </Badge>
                    ) : (
                      <Badge variant="secondary" className="text-xs bg-red-500 text-white">
                        🔴 死叉(看跌)
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
                      <Badge variant="secondary" className="text-xs bg-orange-500 text-white">
                        ⚠️ 超买区域
                      </Badge>
                    ) : etf.cci < -100 ? (
                      <Badge variant="secondary" className="text-xs bg-blue-500 text-white">
                        ⚠️ 超卖区域
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
                      <Badge variant="secondary" className="text-xs bg-orange-500 text-white">
                        ⚠️ 超买区域
                      </Badge>
                    ) : etf.wr < -80 ? (
                      <Badge variant="secondary" className="text-xs bg-blue-500 text-white">
                        ⚠️ 超卖区域
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

  // 1. 获取新闻资讯
  const fetchNews = async () => {
    const industry = getSelectedIndustry()
    if (!industry) return

    setNewsSection({ loading: true, error: null, data: null })

    try {
      const response = await fetch(
        `/api/analysis/industry/${selectedIndustry}/news?industry_name=${encodeURIComponent(industry.name)}&limit=10`
      )

      if (!response.ok) throw new Error('Failed to fetch news')

      const data = await response.json()

      setNewsSection({
        loading: false,
        error: null,
        data: data.success ? data.news : []
      })
    } catch (err) {
      setNewsSection({
        loading: false,
        error: err instanceof Error ? err.message : '获取新闻失败',
        data: null
      })
    }
  }

  // 2. 获取企业发展趋势
  const fetchCompanyTrend = async () => {
    setCompanySection({ loading: true, error: null, data: null })

    try {
      const response = await fetch(
        `/api/analysis/industry/${selectedIndustry}/companies?period_days=90`
      )

      if (!response.ok) throw new Error('Failed to fetch company data')

      const data = await response.json()

      if (data.success) {
        setCompanySection({
          loading: false,
          error: null,
          data: {
            totalCompanies: data.total_companies,
            topCompanies: data.top_companies || [],
            trendReport: data.trend_report
          }
        })
      } else {
        throw new Error(data.error || 'Analysis failed')
      }
    } catch (err) {
      setCompanySection({
        loading: false,
        error: err instanceof Error ? err.message : '获取企业数据失败',
        data: null
      })
    }
  }

  // 3. 获取大盘走势
  const fetchMarketTrend = async () => {
    const industry = getSelectedIndustry()
    if (!industry) return

    setMarketSection({ loading: true, error: null, data: null })
    setSelectedReportId(null) // 清除选中的历史报告

    try {
      const response = await fetch(
        `/api/analysis/industry/${selectedIndustry}/market?industry_name=${encodeURIComponent(industry.name)}&period_days=90`
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
        trendReport: data.trend_report
      }

      setMarketSection({
        loading: false,
        error: null,
        data: marketData
      })

      // 保存报告到缓存
      saveReport(industry.id, industry.name, marketData)

    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : '获取市场数据失败'

      setMarketSection({
        loading: false,
        error: errorMessage,
        data: null
      })
    }
  }

  // 保存报告到缓存（最多5份）
  const saveReport = (industryId: string, industryName: string, data: MarketTrend) => {
    const newReport: MarketReport = {
      id: `${industryId}-${Date.now()}`,
      timestamp: new Date().toISOString(),
      industryId,
      industryName,
      data
    }

    setSavedReports(prev => {
      // 添加新报告到开头
      const updated = [newReport, ...prev]
      // 只保留最新的5份
      const limited = updated.slice(0, 5)

      // 持久化到 localStorage
      try {
        localStorage.setItem('market_reports', JSON.stringify(limited))
      } catch (err) {
        console.error('Failed to save reports to localStorage:', err)
      }

      return limited
    })

    // 自动选中新生成的报告
    setSelectedReportId(newReport.id)
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
    }
  }

  // 4. 获取综合分析报告
  const fetchComprehensiveAnalysis = async () => {
    const industry = getSelectedIndustry()
    if (!industry) return

    setComprehensiveSection({ loading: true, error: null, data: null })

    try {
      const response = await fetch(
        `/api/analysis/industry/${selectedIndustry}/comprehensive?industry_name=${encodeURIComponent(industry.name)}&period_days=90`
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
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <TrendingUp className="h-5 w-5" />
              <CardTitle>大盘趋势分析</CardTitle>
              <Dialog>
                <DialogTrigger className="inline-flex items-center justify-center h-6 w-6 rounded-md hover:bg-accent hover:text-accent-foreground transition-colors">
                  <Info className="h-4 w-4 text-muted-foreground" />
                </DialogTrigger>
                <DialogContent className="max-w-3xl max-h-[80vh] overflow-y-auto">
                  <DialogHeader>
                    <DialogTitle>大盘趋势分析处理流程</DialogTitle>
                    <DialogDescription>
                      系统如何分析产业领域的大盘市场表现
                    </DialogDescription>
                  </DialogHeader>
                  <div className="space-y-4 text-sm">
                    <div className="space-y-2">
                      <h4 className="font-semibold flex items-center gap-2">
                        <span className="flex h-6 w-6 items-center justify-center rounded-full bg-primary text-primary-foreground text-xs">1</span>
                        匹配相关ETF和指数
                      </h4>
                      <p className="text-muted-foreground ml-8">
                        根据产业名称匹配对应的ETF代码和指数代码。系统维护了产业到ETF/指数的映射表，支持精确匹配和模糊匹配。
                      </p>
                      <div className="ml-8 p-3 bg-muted rounded-md">
                        <code className="text-xs">
                          示例：AI芯片 → [159995(AI芯片ETF), 512480(半导体ETF)] + [000688(科技龙头), 399303(国证半导体)]
                        </code>
                      </div>
                    </div>

                    <div className="space-y-2">
                      <h4 className="font-semibold flex items-center gap-2">
                        <span className="flex h-6 w-6 items-center justify-center rounded-full bg-primary text-primary-foreground text-xs">2</span>
                        获取市场数据
                      </h4>
                      <p className="text-muted-foreground ml-8">
                        并行获取匹配到的ETF和指数的历史数据，包括：
                      </p>
                      <ul className="ml-8 space-y-1 list-disc list-inside text-muted-foreground">
                        <li>ETF基本信息（名称、规模、管理费率）</li>
                        <li>日K线数据（开高低收、成交量、成交额）</li>
                        <li>ETF持仓明细（前十大重仓股）</li>
                        <li>指数K线数据（点位、涨跌幅）</li>
                      </ul>
                    </div>

                    <div className="space-y-2">
                      <h4 className="font-semibold flex items-center gap-2">
                        <span className="flex h-6 w-6 items-center justify-center rounded-full bg-primary text-primary-foreground text-xs">3</span>
                        计算技术指标
                      </h4>
                      <p className="text-muted-foreground ml-8">
                        对每个ETF和指数计算关键技术指标：
                      </p>
                      <div className="ml-8 grid grid-cols-2 gap-2">
                        <div className="p-2 bg-muted rounded-md">
                          <div className="font-medium text-xs mb-1">价格指标</div>
                          <ul className="text-xs text-muted-foreground space-y-0.5">
                            <li>• 期间涨跌幅</li>
                            <li>• 年化波动率</li>
                            <li>• 最大回撤</li>
                          </ul>
                        </div>
                        <div className="p-2 bg-muted rounded-md">
                          <div className="font-medium text-xs mb-1">趋势指标</div>
                          <ul className="text-xs text-muted-foreground space-y-0.5">
                            <li>• MA5/MA20/MA60均线</li>
                            <li>• RSI相对强弱指标</li>
                            <li>• 趋势判断（上涨/下跌/震荡）</li>
                          </ul>
                        </div>
                      </div>
                    </div>

                    <div className="space-y-2">
                      <h4 className="font-semibold flex items-center gap-2">
                        <span className="flex h-6 w-6 items-center justify-center rounded-full bg-primary text-primary-foreground text-xs">4</span>
                        AI生成分析报告
                      </h4>
                      <p className="text-muted-foreground ml-8">
                        将计算结果提交给Claude AI，从专业投资分析师角度生成报告，包含：
                      </p>
                      <ul className="ml-8 space-y-1 list-disc list-inside text-muted-foreground">
                        <li>大盘整体走势评估</li>
                        <li>ETF表现对比分析</li>
                        <li>相关指数联动分析</li>
                        <li>技术面分析（均线、支撑压力位）</li>
                        <li>投资机会与风险提示</li>
                      </ul>
                    </div>

                    <div className="p-3 bg-blue-50 dark:bg-blue-950 rounded-md border border-blue-200 dark:border-blue-800">
                      <div className="flex items-start gap-2">
                        <AlertCircle className="h-4 w-4 text-blue-600 dark:text-blue-400 mt-0.5" />
                        <div className="text-xs text-blue-900 dark:text-blue-100">
                          <div className="font-medium mb-1">数据来源</div>
                          <div>使用AKShare获取实时市场数据，分析周期默认为90天，可调整30-365天范围。</div>
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
              onClick={fetchMarketTrend}
              disabled={marketSection.loading || !selectedIndustry}
            >
              {marketSection.loading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  分析中
                </>
              ) : (
                <>
                  <TrendingUp className="mr-2 h-4 w-4" />
                  开始分析
                </>
              )}
            </Button>
          </div>
          <CardDescription>
            相关ETF和指数的市场表现
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* 历史报告选择器 - 始终显示 */}
          {savedReports.length > 0 && (
            <div className="space-y-2">
              <div className="text-sm font-medium text-muted-foreground">历史报告</div>
              <Select value={selectedReportId ?? ''} onValueChange={(value) => {
                if (value) loadReport(value)
              }}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="选择历史报告">
                    {selectedReportId && (() => {
                      const report = savedReports.find(r => r.id === selectedReportId)
                      if (report) {
                        const dateStr = new Date(report.timestamp).toLocaleString('zh-CN', {
                          month: '2-digit',
                          day: '2-digit',
                          hour: '2-digit',
                          minute: '2-digit'
                        })
                        return `${report.industryName}，${dateStr}`
                      }
                      return '选择历史报告'
                    })()}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {savedReports.map((report) => (
                    <SelectItem key={report.id} value={report.id}>
                      <div className="flex flex-col">
                        <span className="font-medium">{report.industryName}</span>
                        <span className="text-xs text-muted-foreground">
                          {new Date(report.timestamp).toLocaleString('zh-CN', {
                            month: '2-digit',
                            day: '2-digit',
                            hour: '2-digit',
                            minute: '2-digit'
                          })}
                        </span>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {marketSection.loading && (
            <div className="space-y-2">
              <Skeleton className="h-16 w-full" />
              <Skeleton className="h-16 w-full" />
            </div>
          )}
          {marketSection.error && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription className="whitespace-pre-wrap">{marketSection.error}</AlertDescription>
            </Alert>
          )}
          {marketSection.data && (
            <>
              {/* 分析完成提示 */}
              <Alert>
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>
                  大盘趋势分析已完成，包含相关ETF和指数的详细市场表现与技术指标。
                </AlertDescription>
              </Alert>

              {/* 查看完整报告按钮 */}
              <div className="flex justify-center pt-2">
                <Button
                  onClick={() => {
                    const industry = getSelectedIndustry()
                    if (industry && marketSection.data) {
                      // 将当前报告数据存储到sessionStorage
                      sessionStorage.setItem('currentMarketReport', JSON.stringify({
                        industryId: selectedIndustry,
                        industryName: industry.name,
                        data: marketSection.data,
                        timestamp: selectedReportId ? savedReports.find(r => r.id === selectedReportId)?.timestamp : new Date().toISOString()
                      }))

                      // 跳转到完整报告页面
                      router.push(`/analysis/market-report?industryId=${selectedIndustry}&industryName=${encodeURIComponent(industry.name)}`)
                    }
                  }}
                  className="gap-2"
                  size="lg"
                >
                  <FileText className="h-4 w-4" />
                  查看完整报告
                </Button>
              </div>
            </>
          )}
          {!marketSection.loading && !marketSection.data && !marketSection.error && (
            <div className="text-sm text-muted-foreground text-center py-8">
              点击右上角"开始分析"按钮获取大盘趋势分析
            </div>
          )}
        </CardContent>
      </Card>

      {/* 相关资讯分析 */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Newspaper className="h-5 w-5" />
              <CardTitle>相关资讯分析</CardTitle>
              <Dialog>
                <DialogTrigger className="inline-flex items-center justify-center h-6 w-6 rounded-md hover:bg-accent hover:text-accent-foreground transition-colors">
                  <Info className="h-4 w-4 text-muted-foreground" />
                </DialogTrigger>
                <DialogContent className="max-w-3xl max-h-[80vh] overflow-y-auto">
                  <DialogHeader>
                    <DialogTitle>相关资讯分析处理流程</DialogTitle>
                    <DialogDescription>
                      系统如何采集和过滤产业相关新闻资讯
                    </DialogDescription>
                  </DialogHeader>
                  <div className="space-y-4 text-sm">
                    <div className="space-y-2">
                      <h4 className="font-semibold flex items-center gap-2">
                        <span className="flex h-6 w-6 items-center justify-center rounded-full bg-primary text-primary-foreground text-xs">1</span>
                        新闻数据采集
                      </h4>
                      <p className="text-muted-foreground ml-8">
                        使用产业名称作为关键词，通过数据服务获取相关新闻资讯。
                      </p>
                      <div className="ml-8 p-3 bg-muted rounded-md">
                        <code className="text-xs">
                          数据来源：财联社、新浪财经、东方财富等金融资讯平台<br />
                          采集量：默认获取30条原始新闻用于后续过滤
                        </code>
                      </div>
                    </div>

                    <div className="space-y-2">
                      <h4 className="font-semibold flex items-center gap-2">
                        <span className="flex h-6 w-6 items-center justify-center rounded-full bg-primary text-primary-foreground text-xs">2</span>
                        关键词过滤
                      </h4>
                      <p className="text-muted-foreground ml-8">
                        对新闻标题和内容进行关键词匹配，筛选出与产业高度相关的资讯：
                      </p>
                      <ul className="ml-8 space-y-1 list-disc list-inside text-muted-foreground">
                        <li>将产业名称拆分为关键词列表</li>
                        <li>检查新闻标题是否包含关键词</li>
                        <li>检查新闻内容是否包含关键词</li>
                        <li>保留至少匹配一个关键词的新闻</li>
                      </ul>
                      <div className="ml-8 p-3 bg-muted rounded-md mt-2">
                        <code className="text-xs">
                          示例：产业"AI芯片" → 关键词["AI", "芯片"]<br />
                          匹配标题包含"AI"或"芯片"的新闻
                        </code>
                      </div>
                    </div>

                    <div className="space-y-2">
                      <h4 className="font-semibold flex items-center gap-2">
                        <span className="flex h-6 w-6 items-center justify-center rounded-full bg-primary text-primary-foreground text-xs">3</span>
                        内容结构化
                      </h4>
                      <p className="text-muted-foreground ml-8">
                        将筛选后的新闻转换为标准化格式：
                      </p>
                      <div className="ml-8 grid grid-cols-2 gap-2">
                        <div className="p-2 bg-muted rounded-md">
                          <div className="font-medium text-xs mb-1">基础信息</div>
                          <ul className="text-xs text-muted-foreground space-y-0.5">
                            <li>• 新闻标题</li>
                            <li>• 来源平台</li>
                            <li>• 发布时间</li>
                            <li>• 原文链接</li>
                          </ul>
                        </div>
                        <div className="p-2 bg-muted rounded-md">
                          <div className="font-medium text-xs mb-1">内容处理</div>
                          <ul className="text-xs text-muted-foreground space-y-0.5">
                            <li>• 提取前200字作为摘要</li>
                            <li>• 按时间倒序排列</li>
                            <li>• 限制返回数量（默认10条）</li>
                          </ul>
                        </div>
                      </div>
                    </div>

                    <div className="space-y-2">
                      <h4 className="font-semibold flex items-center gap-2">
                        <span className="flex h-6 w-6 items-center justify-center rounded-full bg-primary text-primary-foreground text-xs">4</span>
                        前端展示
                      </h4>
                      <p className="text-muted-foreground ml-8">
                        在界面上以卡片形式展示过滤后的新闻列表，包含：
                      </p>
                      <ul className="ml-8 space-y-1 list-disc list-inside text-muted-foreground">
                        <li>新闻标题（加粗显示）</li>
                        <li>内容摘要（灰色文本）</li>
                        <li>来源和时间（小字体底部信息）</li>
                      </ul>
                    </div>

                    <div className="p-3 bg-blue-50 dark:bg-blue-950 rounded-md border border-blue-200 dark:border-blue-800">
                      <div className="flex items-start gap-2">
                        <AlertCircle className="h-4 w-4 text-blue-600 dark:text-blue-400 mt-0.5" />
                        <div className="text-xs text-blue-900 dark:text-blue-100">
                          <div className="font-medium mb-1">实时性说明</div>
                          <div>新闻数据实时从金融资讯平台获取，通常延迟在5-15分钟内。关键词过滤采用简单字符串匹配，确保响应速度。</div>
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
              onClick={fetchNews}
              disabled={newsSection.loading || !selectedIndustry}
            >
              {newsSection.loading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  分析中
                </>
              ) : (
                <>
                  <Newspaper className="mr-2 h-4 w-4" />
                  开始分析
                </>
              )}
            </Button>
          </div>
          <CardDescription>
            最新行业动态和新闻
          </CardDescription>
        </CardHeader>
        <CardContent>
          {newsSection.loading && (
            <div className="space-y-2">
              <Skeleton className="h-24 w-full" />
              <Skeleton className="h-24 w-full" />
            </div>
          )}
          {newsSection.error && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>{newsSection.error}</AlertDescription>
            </Alert>
          )}
          {newsSection.data && newsSection.data.length > 0 && (
            <div className="space-y-3">
              {newsSection.data.map((news: NewsItem, idx: number) => (
                <div key={idx} className="p-3 rounded-lg border">
                  <div className="font-medium mb-1">{news.title}</div>
                  <div className="text-sm text-muted-foreground mb-2">{news.summary}</div>
                  <div className="text-xs text-muted-foreground">
                    {news.source} · {new Date(news.published_at).toLocaleString('zh-CN')}
                  </div>
                </div>
              ))}
            </div>
          )}
          {newsSection.data && newsSection.data.length === 0 && (
            <Alert>
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>暂无相关新闻资讯</AlertDescription>
            </Alert>
          )}
          {!newsSection.loading && !newsSection.data && !newsSection.error && (
            <div className="text-sm text-muted-foreground text-center py-8">
              点击右上角"开始分析"按钮加载相关新闻
            </div>
          )}
        </CardContent>
      </Card>

      {/* 企业发展趋势 */}
      <Card>
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
                        从Neo4j知识图谱中查询指定产业的所有节点：
                      </p>
                      <div className="ml-8 p-3 bg-muted rounded-md">
                        <code className="text-xs">
                          MATCH (n:IndustryNode)<br />
                          WHERE n.industry_id = $industry_id<br />
                          RETURN n.id, n.name, n.layer, n.type
                        </code>
                      </div>
                      <p className="text-muted-foreground ml-8 mt-2">
                        获取产业泳道图的所有节点（设计层、材料层、制造层、应用层等）
                      </p>
                    </div>

                    <div className="space-y-2">
                      <h4 className="font-semibold flex items-center gap-2">
                        <span className="flex h-6 w-6 items-center justify-center rounded-full bg-primary text-primary-foreground text-xs">2</span>
                        提取关联企业
                      </h4>
                      <p className="text-muted-foreground ml-8">
                        遍历每个节点，获取其关联的上市公司：
                      </p>
                      <div className="ml-8 p-3 bg-muted rounded-md">
                        <code className="text-xs">
                          MATCH (n:IndustryNode)-[:HAS_COMPANY]-&gt;(c:Company)<br />
                          RETURN c.symbol, c.name, c.market
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
            <>
              {/* 头部企业 */}
              <div>
                <h4 className="text-sm font-semibold mb-3">头部企业表现</h4>
                <div className="space-y-2">
                  {companySection.data.topCompanies.slice(0, 5).map((company: any, idx: number) => {
                    const priceChangePct = company.price_change_pct ?? company.priceChangePct ?? 0
                    const compositeScore = company.composite_score ?? company.compositeScore ?? 0
                    return (
                      <div key={company.symbol} className="flex items-center justify-between p-3 rounded-lg border">
                        <div className="flex items-center gap-3">
                          <Badge variant="outline">{idx + 1}</Badge>
                          <div>
                            <div className="font-medium">{company.name}</div>
                            <div className="text-sm text-muted-foreground">{company.symbol}</div>
                          </div>
                        </div>
                        <div className="flex items-center gap-3">
                          <div className={`flex items-center gap-1 ${priceChangePct >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                            {priceChangePct >= 0 ? <TrendingUp className="h-4 w-4" /> : <TrendingDown className="h-4 w-4" />}
                            <span className="font-semibold">{(priceChangePct ?? 0).toFixed(2)}%</span>
                          </div>
                          <Badge>{compositeScore}分</Badge>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>

              {/* 趋势报告 */}
              <div>
                <h4 className="text-sm font-semibold mb-3">发展趋势分析</h4>
                <div className="prose prose-sm max-w-none dark:prose-invert">
                  <div className="whitespace-pre-wrap text-sm">{companySection.data.trendReport}</div>
                </div>
              </div>
            </>
          )}
          {!companySection.loading && !companySection.data && !companySection.error && (
            <div className="text-sm text-muted-foreground text-center py-8">
              点击右上角"开始分析"按钮获取企业发展趋势
            </div>
          )}
        </CardContent>
      </Card>

      {/* 综合投资分析 */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <BarChart3 className="h-5 w-5" />
              <CardTitle>综合投资分析</CardTitle>
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
                        报告渲染与展示
                      </h4>
                      <p className="text-muted-foreground ml-8">
                        在前端将Markdown格式的综合报告渲染为富文本：
                      </p>
                      <ul className="ml-8 space-y-1 list-disc list-inside text-muted-foreground">
                        <li>支持Markdown语法（标题、列表、段落）</li>
                        <li>保留原始换行和段落结构（whitespace-pre-wrap）</li>
                        <li>适配深色模式（prose-invert）</li>
                        <li>限制最大宽度，确保可读性</li>
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
    </div>
  )
}
