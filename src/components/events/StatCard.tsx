import { ReactNode } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { LucideIcon } from 'lucide-react'
import { cn } from '@/lib/utils'

interface StatCardProps {
  icon: LucideIcon
  label: string
  value: string | number
  trend?: {
    value: number
    label: string
  }
  variant?: 'default' | 'success' | 'danger' | 'warning'
  badge?: ReactNode
}

/**
 * 数据指标卡片组件
 * 显示图标、数值、趋势和标签
 */
export function StatCard({
  icon: Icon,
  label,
  value,
  trend,
  variant = 'default',
  badge
}: StatCardProps) {
  const variantStyles = {
    default: 'text-foreground',
    success: 'text-green-600',
    danger: 'text-red-600',
    warning: 'text-yellow-600'
  }

  return (
    <Card className="rounded-xl shadow-sm">
      <CardContent className="p-6">
        <div className="flex items-start justify-between">
          <div className="space-y-2 flex-1">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Icon className="h-4 w-4" />
              <span>{label}</span>
            </div>
            <div className={cn("text-2xl font-bold", variantStyles[variant])}>
              {value}
            </div>
            {trend && (
              <div className="text-xs text-muted-foreground">
                <span className={cn(
                  "font-medium",
                  trend.value > 0 && "text-green-600",
                  trend.value < 0 && "text-red-600"
                )}>
                  {trend.value > 0 ? '+' : ''}{trend.value}
                </span>
                <span className="ml-1">{trend.label}</span>
              </div>
            )}
          </div>
          {badge && (
            <div className="ml-2">
              {badge}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  )
}
