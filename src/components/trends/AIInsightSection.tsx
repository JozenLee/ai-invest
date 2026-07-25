import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { CheckCircle, AlertTriangle, Lightbulb } from 'lucide-react'
import { DomainTrendDetail } from '@/types/trend'

interface AIInsightSectionProps {
  trend: DomainTrendDetail
}

/**
 * AI深度分析区块组件
 * 展示Claude生成的完整趋势分析
 */
export function AIInsightSection({ trend }: AIInsightSectionProps) {
  return (
    <Card className="rounded-xl shadow-sm">
      <div className="border-b p-6">
        <div className="flex items-center gap-2">
          <Lightbulb className="h-5 w-5 text-yellow-500" />
          <h2 className="text-lg font-semibold">AI趋势分析</h2>
        </div>
      </div>
      <CardContent className="p-6 space-y-6">
        {/* Current Status */}
        <div>
          <h3 className="text-sm font-medium text-muted-foreground mb-2">当前状态</h3>
          <p className="text-base leading-relaxed">{trend.currentStatus}</p>
        </div>

        {/* Short-term Outlook */}
        <div>
          <h3 className="text-sm font-medium text-muted-foreground mb-2">短期展望（1-2周）</h3>
          <p className="text-base leading-relaxed">{trend.shortTermOutlook}</p>
        </div>

        {/* Medium-term Outlook */}
        <div>
          <h3 className="text-sm font-medium text-muted-foreground mb-2">中期展望（1-3月）</h3>
          <p className="text-base leading-relaxed">{trend.mediumTermOutlook}</p>
        </div>

        {/* Key Drivers */}
        {trend.allKeyDrivers.length > 0 && (
          <div>
            <h3 className="text-sm font-medium text-muted-foreground mb-3">关键驱动因素</h3>
            <ul className="space-y-2">
              {trend.allKeyDrivers.map((driver, index) => (
                <li key={index} className="flex items-start gap-3">
                  <CheckCircle className="h-5 w-5 text-green-500 mt-0.5 shrink-0" />
                  <span className="text-sm leading-relaxed">{driver}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Key Risks */}
        {trend.allKeyRisks.length > 0 && (
          <div>
            <h3 className="text-sm font-medium text-muted-foreground mb-3">关键风险点</h3>
            <ul className="space-y-2">
              {trend.allKeyRisks.map((risk, index) => (
                <li key={index} className="flex items-start gap-3">
                  <AlertTriangle className="h-5 w-5 text-yellow-500 mt-0.5 shrink-0" />
                  <span className="text-sm leading-relaxed">{risk}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* AI Insight */}
        {trend.aiInsight && (
          <div className="p-4 bg-blue-50 dark:bg-blue-900/20 rounded-lg border border-blue-200 dark:border-blue-800">
            <h3 className="text-sm font-medium mb-2 flex items-center gap-2">
              <Lightbulb className="h-4 w-4 text-blue-600" />
              AI洞察
            </h3>
            <p className="text-sm leading-relaxed text-muted-foreground">{trend.aiInsight}</p>
          </div>
        )}

        {/* Confidence Score */}
        <div className="flex items-center justify-between p-4 bg-muted rounded-lg">
          <span className="text-sm font-medium">分析置信度</span>
          <div className="flex items-center gap-2">
            <Badge variant={trend.confidenceScore >= 0.7 ? 'default' : 'secondary'}>
              {(trend.confidenceScore * 100).toFixed(0)}%
            </Badge>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
