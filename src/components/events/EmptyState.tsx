import { cn } from '@/lib/utils'
import { SearchX, FileX, Inbox, Filter, AlertCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'

export type EmptyStateType = 'no-results' | 'no-data' | 'empty-feed' | 'filtered' | 'error'

export interface EmptyStateProps {
  type?: EmptyStateType
  title?: string
  description?: string
  actionLabel?: string
  onAction?: () => void
  className?: string
}

const emptyStateConfig: Record<
  EmptyStateType,
  {
    icon: typeof Inbox
    defaultTitle: string
    defaultDescription: string
  }
> = {
  'no-results': {
    icon: SearchX,
    defaultTitle: '未找到相关内容',
    defaultDescription: '尝试调整搜索关键词或筛选条件',
  },
  'no-data': {
    icon: FileX,
    defaultTitle: '暂无数据',
    defaultDescription: '当前没有可显示的内容',
  },
  'empty-feed': {
    icon: Inbox,
    defaultTitle: '暂无事件',
    defaultDescription: '还没有任何事件数据，请稍后再试',
  },
  'filtered': {
    icon: Filter,
    defaultTitle: '没有符合条件的结果',
    defaultDescription: '当前筛选条件下没有数据',
  },
  'error': {
    icon: AlertCircle,
    defaultTitle: '加载失败',
    defaultDescription: '数据加载出错，请稍后重试',
  },
}

export function EmptyState({
  type = 'no-data',
  title,
  description,
  actionLabel,
  onAction,
  className,
}: EmptyStateProps) {
  const config = emptyStateConfig[type]
  const Icon = config.icon

  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center py-12 px-4 text-center',
        className
      )}
    >
      <div className="rounded-full bg-muted/50 p-4 mb-4">
        <Icon className="size-8 text-muted-foreground" />
      </div>

      <h3 className="text-lg font-medium mb-2">
        {title || config.defaultTitle}
      </h3>

      <p className="text-sm text-muted-foreground max-w-sm mb-4">
        {description || config.defaultDescription}
      </p>

      {actionLabel && onAction && (
        <Button onClick={onAction} variant="outline">
          {actionLabel}
        </Button>
      )}
    </div>
  )
}
