import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import { Circle, CircleCheck, CircleX } from 'lucide-react'

export type Status = 'running' | 'stopped' | 'offline' | 'active' | 'inactive'

export interface StatusBadgeProps {
  status: Status
  className?: string
  showIcon?: boolean
}

const statusConfig: Record<
  Status,
  {
    label: string
    variant: 'default' | 'secondary' | 'destructive' | 'outline'
    icon: typeof Circle
    colorClass: string
  }
> = {
  running: {
    label: '运行中',
    variant: 'default',
    icon: Circle,
    colorClass: 'text-green-500 fill-green-500',
  },
  active: {
    label: '运行中',
    variant: 'default',
    icon: CircleCheck,
    colorClass: 'text-green-500',
  },
  stopped: {
    label: '已停止',
    variant: 'secondary',
    icon: CircleX,
    colorClass: 'text-muted-foreground',
  },
  inactive: {
    label: '已停止',
    variant: 'secondary',
    icon: Circle,
    colorClass: 'text-muted-foreground fill-muted-foreground',
  },
  offline: {
    label: '离线',
    variant: 'destructive',
    icon: CircleX,
    colorClass: 'text-red-500',
  },
}

export function StatusBadge({
  status,
  className,
  showIcon = true,
}: StatusBadgeProps) {
  const config = statusConfig[status]
  const Icon = config.icon

  return (
    <Badge
      variant={config.variant}
      className={cn('gap-1', className)}
    >
      {showIcon && <Icon className={cn('size-3', config.colorClass)} />}
      {config.label}
    </Badge>
  )
}
