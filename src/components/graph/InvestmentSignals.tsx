// 投资信号组件 - 基于市场数据显示智能投资建议
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import {
  TrendingUp,
  AlertTriangle,
  Info,
  Lightbulb,
  Target,
} from 'lucide-react'
import type { MarketDataEnhancement } from '@/lib/services/graph-market-data.service'
import {
  evaluateInvestmentSignals,
  generateInvestmentSummary,
  type InvestmentSignal,
} from '@/lib/config/ai-compute-investment-rules'

interface InvestmentSignalsProps {
  marketData?: MarketDataEnhancement
  nodeType: string
  nodeName: string
}

export function InvestmentSignals({ marketData, nodeType, nodeName }: InvestmentSignalsProps) {
  if (!marketData) {
    return null
  }

  // 评估投资信号
  const signals = evaluateInvestmentSignals(marketData, nodeType)

  if (signals.length === 0) {
    return (
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm flex items-center gap-2">
            <Lightbulb className="h-4 w-4" />
            投资参考
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            当前无明确投资信号，建议继续观察市场动态。
          </p>
        </CardContent>
      </Card>
    )
  }

  const topSignal = signals[0]
  const summary = generateInvestmentSummary(signals)

  const getRiskLevelConfig = (level: string) => {
    switch (level) {
      case 'low':
        return {
          variant: 'default' as const,
          icon: <TrendingUp className="h-4 w-4" />,
          text: '低风险',
          color: 'text-green-600',
        }
      case 'medium':
        return {
          variant: 'secondary' as const,
          icon: <Info className="h-4 w-4" />,
          text: '中风险',
          color: 'text-yellow-600',
        }
      case 'high':
        return {
          variant: 'destructive' as const,
          icon: <AlertTriangle className="h-4 w-4" />,
          text: '高风险',
          color: 'text-red-600',
        }
      default:
        return {
          variant: 'outline' as const,
          icon: <Info className="h-4 w-4" />,
          text: '未知',
          color: 'text-gray-600',
        }
    }
  }

  const riskConfig = getRiskLevelConfig(topSignal.signal.riskLevel)

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-sm flex items-center gap-2">
          <Lightbulb className="h-4 w-4" />
          投资参考
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* 主要信号 */}
        <Alert>
          <Target className="h-4 w-4" />
          <AlertTitle className="text-sm font-semibold">
            {topSignal.signal.name}
          </AlertTitle>
          <AlertDescription className="text-xs text-muted-foreground mt-1">
            {topSignal.signal.description}
          </AlertDescription>
        </Alert>

        {/* 信号强度 */}
        <div className="space-y-2">
          <div className="flex items-center justify-between text-xs">
            <span className="text-muted-foreground">信号强度</span>
            <span className="font-medium">
              {(topSignal.score * 100).toFixed(0)}%
            </span>
          </div>
          <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full transition-all ${
                topSignal.score >= 0.8
                  ? 'bg-green-500'
                  : topSignal.score >= 0.6
                    ? 'bg-yellow-500'
                    : 'bg-orange-500'
              }`}
              style={{ width: `${topSignal.score * 100}%` }}
            />
          </div>
        </div>

        {/* 风险等级 */}
        <div className="flex items-center justify-between">
          <span className="text-xs text-muted-foreground">风险等级</span>
          <Badge variant={riskConfig.variant} className="flex items-center gap-1">
            {riskConfig.icon}
            {riskConfig.text}
          </Badge>
        </div>

        {/* 置信度 */}
        <div className="flex items-center justify-between text-xs">
          <span className="text-muted-foreground">置信度</span>
          <span className="font-medium">
            {(topSignal.signal.confidence * 100).toFixed(0)}%
          </span>
        </div>

        {/* 投资建议 */}
        <div className="space-y-2">
          <h4 className="text-xs font-semibold">投资建议</h4>
          <ul className="space-y-1 text-xs text-muted-foreground">
            {topSignal.signal.recommendations.map((rec, i) => (
              <li key={i} className="flex items-start gap-2">
                <span className="text-primary mt-0.5">•</span>
                <span>{rec}</span>
              </li>
            ))}
          </ul>
        </div>

        {/* 相关ETF */}
        {topSignal.signal.relatedETFs.length > 0 && (
          <div className="space-y-2">
            <h4 className="text-xs font-semibold">相关ETF</h4>
            <div className="flex flex-wrap gap-1">
              {topSignal.signal.relatedETFs.map((etf) => (
                <Badge key={etf} variant="outline" className="text-xs">
                  {etf}
                </Badge>
              ))}
            </div>
          </div>
        )}

        {/* 触发条件 */}
        <div className="border-t pt-3">
          <h4 className="text-xs font-semibold mb-2">触发条件</h4>
          <div className="flex flex-wrap gap-1">
            {topSignal.triggeredConditions.map((cond) => (
              <Badge key={cond} variant="secondary" className="text-xs">
                {cond}
              </Badge>
            ))}
          </div>
        </div>

        {/* 其他信号 */}
        {signals.length > 1 && (
          <div className="border-t pt-3">
            <h4 className="text-xs font-semibold mb-2">
              其他信号 ({signals.length - 1})
            </h4>
            <div className="space-y-1">
              {signals.slice(1, 3).map((sig, i) => (
                <div
                  key={i}
                  className="flex items-center justify-between text-xs p-2 rounded bg-muted/50"
                >
                  <span className="text-muted-foreground">{sig.signal.name}</span>
                  <span className="font-medium">
                    {(sig.score * 100).toFixed(0)}%
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* 免责声明 */}
        <div className="border-t pt-3">
          <p className="text-xs text-muted-foreground italic">
            ⚠️ 以上内容仅供参考，不构成投资建议。投资有风险，决策需谨慎。
          </p>
        </div>
      </CardContent>
    </Card>
  )
}
