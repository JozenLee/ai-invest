// 市场数据面板组件 - 显示节点的投资参考指标
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import {
  TrendingUp,
  TrendingDown,
  Activity,
  DollarSign,
  Newspaper,
  Users,
  Cpu,
  ArrowUp,
  ArrowDown,
  Minus
} from 'lucide-react'
import type { MarketDataEnhancement } from '@/lib/services/graph-market-data.service'

interface MarketDataPanelProps {
  marketData?: MarketDataEnhancement
  nodeName: string
}

export function MarketDataPanel({ marketData, nodeName }: MarketDataPanelProps) {
  if (!marketData) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-sm">市场数据</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">暂无市场数据</p>
        </CardContent>
      </Card>
    )
  }

  const renderChangeIndicator = (value?: number) => {
    if (value === undefined) return null
    if (value > 0) {
      return <span className="text-green-600 flex items-center gap-1">
        <ArrowUp className="h-3 w-3" />
        +{value.toFixed(2)}%
      </span>
    } else if (value < 0) {
      return <span className="text-red-600 flex items-center gap-1">
        <ArrowDown className="h-3 w-3" />
        {value.toFixed(2)}%
      </span>
    }
    return <span className="text-gray-600 flex items-center gap-1">
      <Minus className="h-3 w-3" />
      0.00%
    </span>
  }

  const renderSentimentBadge = (label?: string) => {
    if (!label) return null
    const config = {
      bullish: { text: '看多', variant: 'default' as const, color: 'text-green-600' },
      neutral: { text: '中性', variant: 'secondary' as const, color: 'text-gray-600' },
      bearish: { text: '看空', variant: 'destructive' as const, color: 'text-red-600' },
    }
    const { text, variant } = config[label as keyof typeof config] || config.neutral
    return <Badge variant={variant}>{text}</Badge>
  }

  return (
    <div className="space-y-4">
      {/* 行业指数表现 */}
      {marketData.indexPerformance && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm flex items-center gap-2">
              <Activity className="h-4 w-4" />
              行业指数表现
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div>
              <p className="text-xs text-muted-foreground mb-1">
                {marketData.indexPerformance.name}
              </p>
              <div className="grid grid-cols-3 gap-2 text-xs">
                <div>
                  <span className="text-muted-foreground block mb-1">1日</span>
                  {renderChangeIndicator(marketData.indexPerformance.changePct1d)}
                </div>
                <div>
                  <span className="text-muted-foreground block mb-1">5日</span>
                  {renderChangeIndicator(marketData.indexPerformance.changePct5d)}
                </div>
                <div>
                  <span className="text-muted-foreground block mb-1">30日</span>
                  {renderChangeIndicator(marketData.indexPerformance.changePct30d)}
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* ETF跟踪 */}
      {marketData.etfTracking && marketData.etfTracking.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm flex items-center gap-2">
              <DollarSign className="h-4 w-4" />
              跟踪ETF ({marketData.etfTracking.length})
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {marketData.etfTracking.slice(0, 3).map((etf) => (
              <div key={etf.ticker} className="rounded-lg border p-2">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs font-medium">{etf.name}</span>
                  <span className="text-xs text-muted-foreground">{etf.ticker}</span>
                </div>
                <div className="flex items-center justify-between text-xs">
                  <span className="text-muted-foreground">5日涨跌</span>
                  {renderChangeIndicator(etf.changePct5d)}
                </div>
                {etf.premium !== undefined && (
                  <div className="flex items-center justify-between text-xs mt-1">
                    <span className="text-muted-foreground">溢折价率</span>
                    <span className={etf.premium > 0 ? 'text-red-600' : 'text-green-600'}>
                      {etf.premium > 0 ? '+' : ''}{etf.premium.toFixed(2)}%
                    </span>
                  </div>
                )}
                {etf.inflow5d !== undefined && (
                  <div className="flex items-center justify-between text-xs mt-1">
                    <span className="text-muted-foreground">5日资金流入</span>
                    <span className={etf.inflow5d > 0 ? 'text-green-600' : 'text-red-600'}>
                      {etf.inflow5d > 0 ? '+' : ''}{etf.inflow5d.toFixed(2)}亿
                    </span>
                  </div>
                )}
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* 资金流向 */}
      {marketData.capitalFlow && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm flex items-center gap-2">
              <Activity className="h-4 w-4" />
              资金流向
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <div className="flex items-center justify-between text-xs">
              <span className="text-muted-foreground">主力净流入(5日)</span>
              <span className={
                (marketData.capitalFlow.mainForceNet5d || 0) > 0
                  ? 'text-green-600 font-medium'
                  : 'text-red-600 font-medium'
              }>
                {(marketData.capitalFlow.mainForceNet5d || 0) > 0 ? '+' : ''}
                {((marketData.capitalFlow.mainForceNet5d || 0) / 10000).toFixed(2)}亿
              </span>
            </div>
            {marketData.capitalFlow.sentiment !== undefined && (
              <div className="flex items-center justify-between text-xs">
                <span className="text-muted-foreground">资金情绪</span>
                <div className="flex items-center gap-1">
                  {marketData.capitalFlow.sentiment > 30 ? (
                    <TrendingUp className="h-3 w-3 text-green-600" />
                  ) : marketData.capitalFlow.sentiment < -30 ? (
                    <TrendingDown className="h-3 w-3 text-red-600" />
                  ) : (
                    <Minus className="h-3 w-3 text-gray-600" />
                  )}
                  <span className={
                    marketData.capitalFlow.sentiment > 30
                      ? 'text-green-600'
                      : marketData.capitalFlow.sentiment < -30
                        ? 'text-red-600'
                        : 'text-gray-600'
                  }>
                    {marketData.capitalFlow.sentiment.toFixed(0)}
                  </span>
                </div>
              </div>
            )}
            {marketData.capitalFlow.consecutiveDays !== undefined &&
             marketData.capitalFlow.consecutiveDays !== 0 && (
              <div className="text-xs">
                <Badge variant="outline" className="text-xs">
                  连续{Math.abs(marketData.capitalFlow.consecutiveDays)}日
                  {marketData.capitalFlow.consecutiveDays > 0 ? '流入' : '流出'}
                </Badge>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* 市场认知 */}
      {marketData.marketCognition && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm flex items-center gap-2">
              <Users className="h-4 w-4" />
              市场关注度
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {marketData.marketCognition.institutionalAttention !== undefined && (
              <div>
                <div className="flex items-center justify-between text-xs mb-1">
                  <span className="text-muted-foreground">机构关注</span>
                  <span className="font-medium">
                    {marketData.marketCognition.institutionalAttention}/100
                  </span>
                </div>
                <div className="h-1.5 bg-gray-200 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-blue-500 rounded-full transition-all"
                    style={{ width: `${marketData.marketCognition.institutionalAttention}%` }}
                  />
                </div>
              </div>
            )}
            {marketData.marketCognition.retailAttention !== undefined && (
              <div>
                <div className="flex items-center justify-between text-xs mb-1">
                  <span className="text-muted-foreground">散户关注</span>
                  <span className="font-medium">
                    {marketData.marketCognition.retailAttention}/100
                  </span>
                </div>
                <div className="h-1.5 bg-gray-200 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-orange-500 rounded-full transition-all"
                    style={{ width: `${marketData.marketCognition.retailAttention}%` }}
                  />
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* AI算力特定指标 */}
      {marketData.aiComputeMetrics && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm flex items-center gap-2">
              <Cpu className="h-4 w-4" />
              AI算力指标
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {marketData.aiComputeMetrics.gpuSupplyTightness !== undefined && (
              <div>
                <div className="flex items-center justify-between text-xs mb-1">
                  <span className="text-muted-foreground">GPU供应紧张度</span>
                  <span className="font-medium">
                    {marketData.aiComputeMetrics.gpuSupplyTightness}/100
                  </span>
                </div>
                <div className="h-1.5 bg-gray-200 rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all ${
                      marketData.aiComputeMetrics.gpuSupplyTightness > 70
                        ? 'bg-red-500'
                        : marketData.aiComputeMetrics.gpuSupplyTightness > 40
                          ? 'bg-yellow-500'
                          : 'bg-green-500'
                    }`}
                    style={{ width: `${marketData.aiComputeMetrics.gpuSupplyTightness}%` }}
                  />
                </div>
              </div>
            )}
            {marketData.aiComputeMetrics.hbmSupplyStatus && (
              <div className="flex items-center justify-between text-xs">
                <span className="text-muted-foreground">HBM供应状态</span>
                <Badge variant={
                  marketData.aiComputeMetrics.hbmSupplyStatus === 'tight'
                    ? 'destructive'
                    : marketData.aiComputeMetrics.hbmSupplyStatus === 'normal'
                      ? 'secondary'
                      : 'default'
                }>
                  {marketData.aiComputeMetrics.hbmSupplyStatus === 'tight'
                    ? '紧张'
                    : marketData.aiComputeMetrics.hbmSupplyStatus === 'normal'
                      ? '正常'
                      : '宽松'}
                </Badge>
              </div>
            )}
            {marketData.aiComputeMetrics.nvidiaCycle && (
              <div className="flex items-center justify-between text-xs">
                <span className="text-muted-foreground">NVIDIA产品周期</span>
                <Badge variant="outline">
                  {marketData.aiComputeMetrics.nvidiaCycle === 'pre_launch'
                    ? '发布前'
                    : marketData.aiComputeMetrics.nvidiaCycle === 'launch'
                      ? '新品发布'
                      : marketData.aiComputeMetrics.nvidiaCycle === 'mature'
                        ? '成熟期'
                        : '衰退期'}
                </Badge>
              </div>
            )}
            {marketData.aiComputeMetrics.hyperscalerDemand && (
              <div className="flex items-center justify-between text-xs">
                <span className="text-muted-foreground">云厂商需求</span>
                <Badge variant={
                  marketData.aiComputeMetrics.hyperscalerDemand === 'strong'
                    ? 'default'
                    : marketData.aiComputeMetrics.hyperscalerDemand === 'moderate'
                      ? 'secondary'
                      : 'outline'
                }>
                  {marketData.aiComputeMetrics.hyperscalerDemand === 'strong'
                    ? '强劲'
                    : marketData.aiComputeMetrics.hyperscalerDemand === 'moderate'
                      ? '适中'
                      : '疲软'}
                </Badge>
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  )
}
