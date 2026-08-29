'use client'

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import {
  TrendingUp,
  TrendingDown,
  RefreshCw,
  Building2,
  Globe,
  AlertCircle,
  Info,
  Clock,
  BarChart3,
  CircleDollarSign,
  Archive,
  TriangleAlert,
} from 'lucide-react'
import { useMarketContext } from '@/contexts/MarketContext'
import { usePreferences } from '@/hooks/usePreferences'
import { MarketIndexGrid } from '@/components/market/MarketIndexGrid'
import { DataSourceBadge, MarketStatusBadge } from '@/components/market/MarketMetaBadges'

// 数据说明配置
const dataTooltips = {
  indexPrice: {
    title: '指数行情',
    description: '主要宽基指数的实时/最新收盘价格。',
    calculation: '数据来源：AKShare (东方财富)。显示最新价、涨跌额和涨跌幅百分比。',
  },
  consecutiveTrend: {
    title: '当日热点资金',
    description: '按主力净流入绝对值选出的当日资金最活跃的Top5板块，不代表连续多日流入。',
    calculation: 'Tushare moneyflow_ind_ths（失败时回退 moneyflow_ind_dc）按单日板块净流入排序；展示Top5合计净流入，并按每个入选板块的平均净流入判断强弱。',
  },
  volumeAmplification: {
    title: '成交量放大',
    description: '上证指数当日成交额相对前20个交易日平均成交额的倍数，不是全市场成交量。',
    calculation: 'Tushare index_daily（000001.SH）：当日 amount / 前20个交易日 amount 的平均值；≥1.5仅表示成交额明显放大，不直接等于资金净流入。',
  },
  priceFlowDivergence: {
    title: '板块价格资金背离',
    description: '资金净额绝对值最大的单个板块，其板块涨跌幅与资金方向不一致时的提示，不是大盘或个股背离。',
    calculation: '看多型：该板块净流入>5亿元且板块跌幅<-1%；看空型：净流出<-5亿元且板块涨幅>1%。仅为单日筛选信号，不代表必然反转。',
  },
  dragonTiger: {
    title: '龙虎榜数据',
    description: 'Tushare top_list 返回的当日龙虎榜上榜股票明细，反映触发异动条件的个股集合。',
    calculation: '当前仅统计上榜股票数量，并汇总 top_list 的 net_amount 作为上榜明细净额；没有调用 top_inst，因此不能称为“机构席位净买入”。',
  },
  northboundCapital: {
    title: '北向资金',
    description: '沪股通与深股通的资金净流入合计，来源于 Tushare moneyflow_hsgt；非交易日可能展示最近交易日。',
    calculation: '北向净流入 = north_money = hgt（沪股通）+ sgt（深股通）；Tushare 原始单位为万元，页面换算为亿元。',
  },
  sectorInflow: {
    title: '板块资金流入排名',
    description: '按单日主力净流入排序的板块排名；默认优先使用 Tushare moneyflow_ind_ths，失败时使用 moneyflow_ind_dc。',
    calculation: '取净流入为正的板块按 net_amount 降序排列，显示前10；金额统一换算为亿元。板块口径取决于命中的 Tushare 接口，页面应以数据源标识为准。',
  },
  sectorOutflow: {
    title: '板块资金流出排名',
    description: '按单日主力净流出排序的板块排名；默认优先使用 Tushare moneyflow_ind_ths，失败时使用 moneyflow_ind_dc。',
    calculation: '取净流入为负的板块按 net_amount 升序排列，显示前10；金额统一换算为亿元。它反映资金方向，不等同于板块基本面恶化。',
  },
  dataQualityEstimated: {
    title: '数据质量：估算值',
    description: '当前显示的资金流向数据为估算值，非实际交易数据。',
    calculation: '由于部分数据源暂时不可用，系统使用可用数据源估算。建议结合其他指标综合判断。',
  },
  dataQualityCached: {
    title: '数据质量：缓存数据',
    description: '当前显示的资金流向数据为缓存数据，非最新数据。',
    calculation: '所有数据源暂时不可用，系统显示最近缓存的数据。数据可能已过时，建议稍后刷新或等待数据源恢复后获取最新数据。',
  },
}

// Info按钮组件
function InfoButton({ tooltip }: { tooltip: keyof typeof dataTooltips }) {
  const info = dataTooltips[tooltip]
  return (
    <Tooltip>
      <TooltipTrigger
        aria-label={`查看${info.title}说明`}
        className="inline-flex size-9 items-center justify-center rounded-full bg-muted transition-colors hover:bg-muted-foreground/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <Info className="h-3.5 w-3.5 text-muted-foreground" aria-hidden="true" />
      </TooltipTrigger>
      <TooltipContent side="bottom" align="end" className="max-w-xs p-3">
        <div className="space-y-1.5">
          <p className="font-semibold text-sm">{info.title}</p>
          <p className="text-xs text-muted-foreground">{info.description}</p>
          <div className="pt-1.5 border-t border-muted-foreground/20">
            <p className="text-xs"><span className="font-medium">计算方法：</span>{info.calculation}</p>
          </div>
        </div>
      </TooltipContent>
    </Tooltip>
  )
}

export default function DashboardPage() {
  const { indices, capitalFlow, isLoading, error, marketMeta, refetch, format } = useMarketContext()
  const { preferences } = usePreferences()

  const formatNumber = (num: number | undefined | null, decimals = 2) => {
    if (num === undefined || num === null || isNaN(num)) return '0.00'
    return num.toFixed(decimals)
  }

  const getChangeColor = (change: number | undefined | null) => {
    if (change === undefined || change === null) return 'text-gray-500'
    return change >= 0 ? 'text-red-500' : 'text-green-500'
  }

  const getChangeSymbol = (change: number | undefined | null) => {
    if (change === undefined || change === null) return ''
    return change >= 0 ? '▲' : '▼'
  }

  return (
    <TooltipProvider>
      <div className="animate-rise space-y-8">
        {/* 页面标题 */}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <p className="mb-2 text-xs font-semibold uppercase tracking-[0.16em] text-primary">市场监控</p>
            <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">市场数据</h1>
            <p className="mt-1 text-muted-foreground">
              市场概览与资金流向分析
            </p>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              {/* 市场状态 */}
              {format.statusBadge.label && (
                <MarketStatusBadge statusBadge={format.statusBadge} isRealtime={marketMeta?.isRealtime} />
              )}
              {/* 数据来源 */}
              <DataSourceBadge sourceDisplay={format.sourceDisplay} />
              {/* 最近交易日 */}
              {marketMeta?.lastTradingDate && (
                <span className="text-xs text-muted-foreground">
                  数据日期: {marketMeta.lastTradingDate}
                </span>
              )}
              {/* 更新时间 */}
              {format.timeDisplay && (
                <span className="text-xs text-muted-foreground flex items-center gap-1">
                  <Clock className="h-3 w-3" />
                  {format.timeDisplay} 更新
                </span>
              )}
            </div>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={refetch}
            disabled={isLoading}
            className="self-start"
          >
            <RefreshCw className={`mr-2 h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
            刷新数据
          </Button>
        </div>

        {/* 错误提示 */}
        {error && (
          <div role="alert" className="rounded-xl border border-amber-200 bg-amber-50/80 p-4 text-amber-900 dark:border-amber-900/60 dark:bg-amber-950/30 dark:text-amber-100">
            <div className="flex items-center gap-2">
              <AlertCircle className="h-4 w-4" />
              <p className="text-sm font-medium">数据获取失败</p>
            </div>
            <p className="text-sm mt-1">{error}</p>
            <p className="text-xs mt-2 text-yellow-600 dark:text-yellow-400">
              请确认 Python 数据服务已启动：cd data-service && python main.py
            </p>
          </div>
        )}

        {/* 第一区域：市场指数概览 */}
        <section>
            <div className="mb-4 flex flex-wrap items-center gap-2 border-b border-border/70 pb-3">
              <div className="flex items-center gap-2">
                <span className="flex size-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
                  <BarChart3 className="h-4 w-4" aria-hidden="true" />
                </span>
                <h2 className="text-lg font-semibold">市场指数</h2>
              </div>
            <InfoButton tooltip="indexPrice" />
          </div>
          <MarketIndexGrid indices={indices} isLoading={isLoading} />
        </section>

        {/* 第二区域：资金流向 */}
        {capitalFlow && (
          <section>
            <div className="flex items-center gap-2 mb-4">
              <div className="flex items-center gap-2">
                <span className="flex size-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
                  <CircleDollarSign className="h-4 w-4" aria-hidden="true" />
                </span>
                <h2 className="text-lg font-semibold">资金流向分析</h2>
              </div>
              {capitalFlow.sourceDetails && (
                <span className="text-xs text-muted-foreground">
                  数据源：板块 {capitalFlow.sourceDetails.sectorFlow} · 北向 {capitalFlow.sourceDetails.northbound} · 成交额 {capitalFlow.sourceDetails.volume || 'Tushare'} · 龙虎榜 {capitalFlow.sourceDetails.dragonTiger}
                </span>
              )}
              {capitalFlow.sectorRealtime === false && (
                <Badge variant="outline" className="gap-1.5 border-amber-400 text-amber-700 dark:text-amber-300">
                  板块资金为最新交易日统计
                </Badge>
              )}
              {/* 数据质量标识 */}
              {preferences.showDataQualityBadge && capitalFlow.dataQuality === 'estimated' && (
                <Tooltip>
                  <TooltipTrigger>
                    <Badge variant="outline" className="gap-1.5 border-amber-400 text-amber-700 dark:text-amber-300">
                      <TriangleAlert className="size-3" aria-hidden="true" />
                      估算数据
                    </Badge>
                  </TooltipTrigger>
                  <TooltipContent side="bottom" className="max-w-xs p-3">
                    <div className="space-y-1.5">
                      <p className="font-semibold text-sm">{dataTooltips.dataQualityEstimated.title}</p>
                      <p className="text-xs text-muted-foreground">{dataTooltips.dataQualityEstimated.description}</p>
                      <div className="pt-1.5 border-t border-muted-foreground/20">
                        <p className="text-xs"><span className="font-medium">说明：</span>{dataTooltips.dataQualityEstimated.calculation}</p>
                      </div>
                    </div>
                  </TooltipContent>
                </Tooltip>
              )}
              {preferences.showDataQualityBadge && capitalFlow.dataQuality === 'cached' && (
                <Tooltip>
                  <TooltipTrigger>
                    <Badge variant="secondary" className="gap-1.5">
                      <Archive className="size-3" aria-hidden="true" />
                      缓存数据
                    </Badge>
                  </TooltipTrigger>
                  <TooltipContent side="bottom" className="max-w-xs p-3">
                    <div className="space-y-1.5">
                      <p className="font-semibold text-sm">{dataTooltips.dataQualityCached.title}</p>
                      <p className="text-xs text-muted-foreground">{dataTooltips.dataQualityCached.description}</p>
                      <div className="pt-1.5 border-t border-muted-foreground/20">
                        <p className="text-xs"><span className="font-medium">说明：</span>{dataTooltips.dataQualityCached.calculation}</p>
                      </div>
                    </div>
                  </TooltipContent>
                </Tooltip>
              )}
            </div>
            <div className="grid gap-4 grid-cols-2 md:grid-cols-3 lg:grid-cols-5">
              {/* 持续流入趋势 */}
              {capitalFlow.consecutiveTrend && (
                <Card className="hover:shadow-md transition-shadow">
                  <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <CardTitle className="text-sm font-medium">当日热点资金</CardTitle>
                    <div className="flex items-center gap-1">
                      <TrendingUp className="h-4 w-4 text-muted-foreground" />
                      <InfoButton tooltip="consecutiveTrend" />
                    </div>
                  </CardHeader>
                  <CardContent>
                    <div className={`text-2xl font-bold ${getChangeColor(capitalFlow.consecutiveTrend.totalNet)}`}>
                      {capitalFlow.consecutiveTrend.totalNet >= 0 ? '+' : ''}{formatNumber(capitalFlow.consecutiveTrend.totalNet)}亿
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {capitalFlow.consecutiveTrend.direction === 'inflow' ? '流入' : '流出'} · {capitalFlow.consecutiveTrend.strength === 'strong' ? '强势' : capitalFlow.consecutiveTrend.strength === 'moderate' ? '温和' : '弱势'}
                    </p>
                  </CardContent>
                </Card>
              )}

              {/* 成交量放大 */}
              {capitalFlow.volumeAmplification && (
                <Card className="hover:shadow-md transition-shadow">
                  <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <CardTitle className="text-sm font-medium">成交量放大</CardTitle>
                    <div className="flex items-center gap-1">
                      <TrendingUp className="h-4 w-4 text-muted-foreground" />
                      <InfoButton tooltip="volumeAmplification" />
                    </div>
                  </CardHeader>
                  <CardContent>
                    <div className={`text-2xl font-bold ${capitalFlow.volumeAmplification.isAmplified ? 'text-red-500' : 'text-gray-500'}`}>
                      {formatNumber(capitalFlow.volumeAmplification.amplification)}x
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {capitalFlow.volumeAmplification.isAmplified ? '成交活跃' : '成交正常'}
                    </p>
                  </CardContent>
                </Card>
              )}

              {/* 价格资金背离 */}
              {capitalFlow.priceFlowDivergence && (
                <Card className="hover:shadow-md transition-shadow">
                  <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <CardTitle className="text-sm font-medium">价格资金背离</CardTitle>
                    <div className="flex items-center gap-1">
                      <AlertCircle className="h-4 w-4 text-muted-foreground" />
                      <InfoButton tooltip="priceFlowDivergence" />
                    </div>
                  </CardHeader>
                  <CardContent>
                    <div className={`text-xl font-bold ${capitalFlow.priceFlowDivergence.isDivergent ? 'text-amber-500' : 'text-gray-500'}`}>
                      {capitalFlow.priceFlowDivergence.isDivergent ? (
                        capitalFlow.priceFlowDivergence.divergenceType === 'bullish' ? '看多背离' : '看空背离'
                      ) : '无背离'}
                    </div>
                    <p className="text-xs text-muted-foreground">
                      价格{capitalFlow.priceFlowDivergence.priceChange >= 0 ? '+' : ''}{formatNumber(capitalFlow.priceFlowDivergence.priceChange)}%
                    </p>
                  </CardContent>
                </Card>
              )}

              {/* 龙虎榜数据 */}
              {capitalFlow.institutionalBehavior?.dragonTiger && (
                <Card className="hover:shadow-md transition-shadow">
                  <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <CardTitle className="text-sm font-medium">龙虎榜</CardTitle>
                    <div className="flex items-center gap-1">
                      <Building2 className="h-4 w-4 text-muted-foreground" />
                      <InfoButton tooltip="dragonTiger" />
                    </div>
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold">
                      {capitalFlow.institutionalBehavior.dragonTiger.count}只
                    </div>
                    <p className="text-xs text-muted-foreground">
                      上榜股票
                    </p>
                  </CardContent>
                </Card>
              )}

              {/* 北向资金 */}
              {capitalFlow.institutionalBehavior?.northboundCapital && (
                <Card className="hover:shadow-md transition-shadow">
                  <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <CardTitle className="text-sm font-medium">北向资金</CardTitle>
                    <div className="flex items-center gap-1">
                      <Globe className="h-4 w-4 text-muted-foreground" />
                      <InfoButton tooltip="northboundCapital" />
                    </div>
                  </CardHeader>
                  <CardContent>
                    {(() => {
                      const nb = capitalFlow.institutionalBehavior.northboundCapital
                      const hasNorthboundData = nb && typeof nb.net === 'number' && !isNaN(nb.net) && nb.source !== 'unavailable' && Boolean(nb.dataDate)
                      return hasNorthboundData ? (
                        <>
                          <div className={`text-2xl font-bold ${getChangeColor(nb.net)}`}>
                            {nb.net >= 0 ? '+' : ''}{formatNumber(nb.net)}亿
                          </div>
                          <p className="text-xs text-muted-foreground">
                            沪股通 {formatNumber(nb.shConnect)}亿 · 深股通 {formatNumber(nb.szConnect)}亿
                          </p>
                        </>
                      ) : (
                        <div className="text-2xl font-bold text-muted-foreground">暂无</div>
                      )
                    })()}
                  </CardContent>
                </Card>
              )}
            </div>

            {/* 数据说明 */}
            {capitalFlow.dataQuality === 'estimated' && (
              <Card className="mt-4 border-amber-200 dark:border-amber-800 bg-amber-50/50 dark:bg-amber-950/20">
                <CardContent className="pt-4">
                  <div className="flex gap-3">
                    <AlertCircle className="h-5 w-5 text-amber-600 dark:text-amber-400 flex-shrink-0 mt-0.5" />
                    <div className="space-y-2 text-sm">
                      <p className="font-semibold text-amber-900 dark:text-amber-100">
                        数据说明
                      </p>
                      <ul className="space-y-1 text-amber-800 dark:text-amber-200">
                        <li>• <strong>当日热点资金</strong>：单日资金最活跃的Top5板块快照，不代表连续流入</li>
                        <li>• <strong>成交量放大</strong>：上证指数成交额相对前20日均值的倍数</li>
                        <li>• <strong>板块价格资金背离</strong>：最大资金板块的涨跌幅与资金方向不一致时提示</li>
                        <li>• <strong>龙虎榜</strong>：top_list 上榜股票数量与明细净额，不等同于机构席位数据</li>
                      </ul>
                      <p className="text-xs text-amber-700 dark:text-amber-300 pt-2 border-t border-amber-200 dark:border-amber-800">
                        ⚠️ <strong>风险提示</strong>：以上数据为技术分析指标，不构成投资建议。实际投资需结合基本面、市场环境等多方面因素综合判断。
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}
          </section>
        )}

        {/* 第三区域：板块资金流向 */}
        {capitalFlow && (capitalFlow.topInflowSectors.length > 0 || capitalFlow.topOutflowSectors.length > 0) && (
          <section>
            <div className="flex items-center gap-2 mb-4">
              <div className="flex items-center gap-2">
                <span className="flex size-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
                  <BarChart3 className="h-4 w-4" aria-hidden="true" />
                </span>
                <h2 className="text-lg font-semibold">板块资金流向</h2>
              </div>
            </div>
            <div className="grid gap-4 lg:grid-cols-2">
              {/* Top10 资金流入板块 */}
              <Card className="hover:shadow-md transition-shadow">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <TrendingUp className="h-5 w-5 text-red-500" />
                    Top10 资金流入板块
                    <InfoButton tooltip="sectorInflow" />
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    <div className="flex items-center justify-between text-xs text-muted-foreground border-b pb-2">
                      <div className="flex items-center gap-3">
                        <span className="w-6 text-center">排名</span>
                        <span className="w-28">板块</span>
                      </div>
                      <div className="flex items-center gap-4">
                        <span className="w-20 text-right">净流入(亿)</span>
                        <span className="w-16 text-right">涨跌幅</span>
                      </div>
                    </div>
                    {capitalFlow.topInflowSectors.map((sector, index) => (
                      <div key={sector.sector} className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <span className={`text-sm font-medium w-6 text-center ${index < 3 ? 'text-red-500 font-bold' : 'text-muted-foreground'}`}>
                            {index + 1}
                          </span>
                          <span className="font-medium w-28 whitespace-nowrap">{sector.sector}</span>
                        </div>
                        <div className="flex items-center gap-4">
                          <span className={`text-sm font-medium w-20 text-right ${getChangeColor(sector.netFlow)}`}>
                            {sector.netFlow >= 0 ? '+' : ''}{formatNumber(sector.netFlow)}
                          </span>
                          <span className={`text-sm w-16 text-right ${getChangeColor(sector.changePct)}`}>
                            {getChangeSymbol(sector.changePct)}{formatNumber(Math.abs(sector.changePct))}%
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>

              {/* Top10 资金流出板块 */}
              <Card className="hover:shadow-md transition-shadow">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <TrendingDown className="h-5 w-5 text-green-500" />
                    Top10 资金流出板块
                    <InfoButton tooltip="sectorOutflow" />
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    <div className="flex items-center justify-between text-xs text-muted-foreground border-b pb-2">
                      <div className="flex items-center gap-3">
                        <span className="w-6 text-center">排名</span>
                        <span className="w-28">板块</span>
                      </div>
                      <div className="flex items-center gap-4">
                        <span className="w-20 text-right">净流出(亿)</span>
                        <span className="w-16 text-right">涨跌幅</span>
                      </div>
                    </div>
                    {capitalFlow.topOutflowSectors.map((sector, index) => (
                      <div key={sector.sector} className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <span className={`text-sm font-medium w-6 text-center ${index < 3 ? 'text-green-500 font-bold' : 'text-muted-foreground'}`}>
                            {index + 1}
                          </span>
                          <span className="font-medium w-28 whitespace-nowrap">{sector.sector}</span>
                        </div>
                        <div className="flex items-center gap-4">
                          <span className={`text-sm font-medium w-20 text-right ${getChangeColor(sector.netFlow)}`}>
                            {sector.netFlow >= 0 ? '+' : ''}{formatNumber(sector.netFlow)}
                          </span>
                          <span className={`text-sm w-16 text-right ${getChangeColor(sector.changePct)}`}>
                            {getChangeSymbol(sector.changePct)}{formatNumber(Math.abs(sector.changePct))}%
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            </div>
          </section>
        )}

        {/* 页面底部：Tushare 可补充但当前未展示的数据 */}
        {capitalFlow && (
          <section>
            <div className="mb-4 flex items-center gap-2">
              <div className="flex size-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <Info className="h-4 w-4" aria-hidden="true" />
              </div>
              <div>
                <h2 className="text-lg font-semibold">Tushare 可补充但当前未展示的数据</h2>
                <p className="text-xs text-muted-foreground">这些接口能补充资金来源、持续性和风险验证，当前页面尚未接入可视化。</p>
              </div>
            </div>
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {[
                ['moneyflow（个股资金流）', '按个股拆分超大单、大单、中单、小单净流入，可用于验证板块排名中的龙头个股、识别个股资金与板块方向是否一致。'],
                ['top_inst（龙虎榜机构明细）', '按营业部/机构席位拆分买卖金额，能回答“是谁在买卖”；当前 top_list 只有上榜股票明细，不能替代该接口。'],
                ['moneyflow_cnt_ths（概念资金流）', '提供同花顺概念/题材维度的资金流向，可与当前行业维度对照，识别“行业上涨但题材资金分散”等结构差异。'],
                ['margin / margin_detail（融资融券）', '融资余额、融资买入额、融券余额等杠杆资金数据，可用于判断风险偏好和上涨是否由杠杆资金推动。'],
                ['moneyflow_ind_dc 额外字段', '除净额外还包含净流入占比、超大单/大单等分档字段，可补充资金强度和参与结构；当前仅展示净额与板块涨跌幅。'],
                ['index_daily / daily_basic 历史指标', '可补充成交额趋势、换手率、量价关系和历史分位，用于把当前单日快照扩展为可回溯的资金持续性分析。'],
              ].map(([title, description]) => (
                <Card key={title} className="bg-muted/20">
                  <CardContent className="p-4">
                    <p className="text-sm font-semibold">{title}</p>
                    <p className="mt-1 text-xs leading-5 text-muted-foreground">{description}</p>
                  </CardContent>
                </Card>
              ))}
            </div>
          </section>
        )}

        {/* 无数据时的提示 */}
        {!capitalFlow && !isLoading && (
          <Card>
            <CardContent className="flex items-center justify-center py-8">
              <div className="text-center text-muted-foreground">
                <AlertCircle className="h-8 w-8 mx-auto mb-2" />
                <p>暂无资金流向数据</p>
                <p className="text-xs mt-1">请确认数据服务已启动</p>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </TooltipProvider>
  )
}
