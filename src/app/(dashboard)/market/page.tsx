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
  Users,
  Globe,
  AlertCircle,
  Info,
  Clock,
} from 'lucide-react'
import { useMarketContext } from '@/contexts/MarketContext'
import { usePreferences } from '@/hooks/usePreferences'

// 数据说明配置
const dataTooltips = {
  indexPrice: {
    title: '指数行情',
    description: '主要宽基指数的实时/最新收盘价格。',
    calculation: '数据来源：AKShare (东方财富)。显示最新价、涨跌额和涨跌幅百分比。',
  },
  consecutiveTrend: {
    title: '持续流入趋势',
    description: '分析主力资金连续多日流入的板块，比单日数据更能反映市场持续性方向。',
    calculation: '统计Top板块的主力资金净流入累计值和日均值。连续流入≥3天且日均≥10亿为强势，≥3亿为温和。',
  },
  volumeAmplification: {
    title: '成交量放大',
    description: '当日成交量与近期均量的对比，放大倍数≥1.5倍说明资金活跃度显著提升。',
    calculation: '成交量放大倍数 = 当日成交量 / 近N日均量。结合资金流向判断：放量+流入=强势，放量+流出=恐慌。',
  },
  priceFlowDivergence: {
    title: '价格资金背离',
    description: '股价涨跌与资金流向不一致时的信号。资金流入但股价下跌可能是洗盘或分歧，反之可能是散户推动。',
    calculation: '看多背离：资金流入>5亿但股价跌>1%；看空背离：资金流出>5亿但股价涨>1%。背离后往往有反转或加速。',
  },
  dragonTiger: {
    title: '龙虎榜数据',
    description: '异常波动个股的买卖席位数据，机构席位的净买入最能反映聪明钱动向。',
    calculation: '统计当日上榜股票数量和机构席位净买入金额。机构持续买入的板块往往是热点方向。',
  },
  northboundCapital: {
    title: '北向资金',
    description: '通过沪深港通流入A股的境外资金，被称为"聪明钱"，对市场趋势有领先指示作用。',
    calculation: '北向资金净流入 = 沪股通净流入 + 深股通净流入。数据来源：东方财富互联互通数据。',
  },
  sectorInflow: {
    title: '板块资金流入排名',
    description: '当日主力资金净流入最多的行业板块，反映市场热点方向。',
    calculation: '按行业分类统计主力净流入金额，取Top10。数据来源：东方财富行业资金流向。',
  },
  sectorOutflow: {
    title: '板块资金流出排名',
    description: '当日主力资金净流出最多的行业板块，反映市场回避方向。',
    calculation: '按行业分类统计主力净流出金额，取Top10。数据来源：东方财富行业资金流向。',
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
      <TooltipTrigger className="inline-flex items-center justify-center w-4 h-4 rounded-full bg-muted hover:bg-muted-foreground/20 transition-colors">
        <Info className="h-3 w-3 text-muted-foreground" />
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
  const { indices, capitalFlow, isLoading, error, source, lastUpdate, marketMeta, refetch, format } = useMarketContext()
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
      <div className="space-y-8">
        {/* 页面标题 */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">仪表盘</h1>
            <p className="text-muted-foreground mt-1">
              市场概览与资金流向分析
            </p>
            <div className="flex items-center gap-2 mt-2">
              {/* 市场状态 */}
              {format.statusBadge.label && (
                <Badge variant={format.statusBadge.variant} className="text-xs">
                  {format.statusBadge.icon} {format.statusBadge.label}
                  {!marketMeta?.isRealtime && ' · 收盘数据'}
                </Badge>
              )}
              {/* 数据来源 */}
              <Badge variant="outline" className="text-xs">
                {format.sourceDisplay.icon} {format.sourceDisplay.text}
              </Badge>
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
          >
            <RefreshCw className={`mr-2 h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
            刷新数据
          </Button>
        </div>

        {/* 错误提示 */}
        {error && (
          <div className="rounded-lg bg-yellow-50 p-4 text-yellow-800 dark:bg-yellow-900/20 dark:text-yellow-200">
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
          <div className="flex items-center gap-2 mb-4">
            <h2 className="text-lg font-semibold">📊 市场指数</h2>
            <InfoButton tooltip="indexPrice" />
            {marketMeta && !marketMeta.isRealtime && (
              <span className="text-xs text-amber-600 dark:text-amber-400 flex items-center gap-1">
                <Clock className="h-3 w-3" />
                非交易时间，显示{marketMeta.lastTradingDate}收盘数据
              </span>
            )}
          </div>
          {indices.length > 0 ? (
            <div className="grid gap-4 grid-cols-2 md:grid-cols-3 lg:grid-cols-5">
              {indices.map((index) => (
                <Card key={index.code} className="hover:shadow-md transition-shadow">
                  <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <CardTitle className="text-sm font-medium">{index.name}</CardTitle>
                    {index.changePct >= 0 ? (
                      <TrendingUp className="h-4 w-4 text-red-500" />
                    ) : (
                      <TrendingDown className="h-4 w-4 text-green-500" />
                    )}
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold">{formatNumber(index.price)}</div>
                    <p className={`text-xs ${getChangeColor(index.changePct)}`}>
                      {getChangeSymbol(index.changePct)} {formatNumber(Math.abs(index.changePct))}%
                      ({formatNumber(Math.abs(index.change))})
                    </p>
                    {/* 收盘数据标注 */}
                    {marketMeta && !marketMeta.isRealtime && (
                      <p className="text-xs text-amber-600 dark:text-amber-400 mt-1">
                        收盘价
                      </p>
                    )}
                  </CardContent>
                </Card>
              ))}
            </div>
          ) : (
            <Card>
              <CardContent className="flex items-center justify-center py-8">
                <div className="text-center text-muted-foreground">
                  <AlertCircle className="h-8 w-8 mx-auto mb-2" />
                  <p>暂无指数数据</p>
                  <p className="text-xs mt-1">请确认数据服务已启动</p>
                </div>
              </CardContent>
            </Card>
          )}
        </section>

        {/* 第二区域：资金流向 */}
        {capitalFlow && (
          <section>
            <div className="flex items-center gap-2 mb-4">
              <h2 className="text-lg font-semibold">💰 资金流向分析</h2>
              {marketMeta && !marketMeta.isRealtime && (
                <span className="text-xs text-amber-600 dark:text-amber-400 flex items-center gap-1">
                  <Clock className="h-3 w-3" />
                  非交易时间，数据可能为上一交易日
                </span>
              )}
              {/* 数据质量标识 */}
              {preferences.showDataQualityBadge && capitalFlow.dataQuality === 'estimated' && (
                <Tooltip>
                  <TooltipTrigger>
                    <Badge variant="outline" className="text-xs text-yellow-600 dark:text-yellow-400 border-yellow-400 cursor-help">
                      ⚠️ 估算数据
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
                    <Badge variant="secondary" className="text-xs cursor-help">
                      📦 缓存数据
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
                    <CardTitle className="text-sm font-medium">持续流入趋势</CardTitle>
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
                      const hasNorthboundData = nb && typeof nb.net === 'number' && !isNaN(nb.net) && nb.net !== 0
                      return hasNorthboundData ? (
                        <>
                          <div className={`text-2xl font-bold ${getChangeColor(nb.net)}`}>
                            {nb.net >= 0 ? '+' : ''}{formatNumber(nb.net)}亿
                          </div>
                          <p className="text-xs text-muted-foreground">
                            沪股通 {formatNumber(nb.shConnect)}亿 · 深股通 {formatNumber(nb.szConnect)}亿
                          </p>
                          {nb.stale && (
                            <p className="text-xs text-amber-600 dark:text-amber-400 mt-1 flex items-center gap-1">
                              <Clock className="h-3 w-3" />
                              {nb.dataDate || '上一交易日'}收盘数据
                            </p>
                          )}
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
                        <li>• <strong>持续流入趋势</strong>：分析Top板块主力资金连续流入情况，比单日数据更稳定</li>
                        <li>• <strong>成交量放大</strong>：当日成交量与近期均量对比，放量配合资金流向判断强弱</li>
                        <li>• <strong>价格资金背离</strong>：股价与资金流向不一致时的预警信号</li>
                        <li>• <strong>龙虎榜</strong>：异常波动个股的机构行为，反映聪明钱动向</li>
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
              <h2 className="text-lg font-semibold">📈 板块资金流向</h2>
              {marketMeta && !marketMeta.isRealtime && (
                <span className="text-xs text-amber-600 dark:text-amber-400 flex items-center gap-1">
                  <Clock className="h-3 w-3" />
                  收盘数据
                </span>
              )}
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
