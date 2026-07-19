import { cn } from '@/lib/utils'
import { AlertTriangle, WifiOff, ServerCrash, RefreshCw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'

export type ErrorType = 'network' | 'server' | 'offline' | 'unknown'

export interface ErrorStateProps {
  type?: ErrorType
  error?: Error | string
  title?: string
  description?: string
  showRetry?: boolean
  onRetry?: () => void
  showDetails?: boolean
  fallbackMode?: boolean
  fallbackMessage?: string
  className?: string
}

const errorConfig: Record<
  ErrorType,
  {
    icon: typeof AlertTriangle
    defaultTitle: string
    defaultDescription: string
  }
> = {
  network: {
    icon: WifiOff,
    defaultTitle: '网络连接失败',
    defaultDescription: '请检查网络连接后重试',
  },
  server: {
    icon: ServerCrash,
    defaultTitle: '服务异常',
    defaultDescription: '数据服务暂时不可用，请稍后再试',
  },
  offline: {
    icon: WifiOff,
    defaultTitle: '离线模式',
    defaultDescription: '数据服务离线，已切换到本地缓存数据',
  },
  unknown: {
    icon: AlertTriangle,
    defaultTitle: '加载失败',
    defaultDescription: '数据加载出错，请稍后重试',
  },
}

export function ErrorState({
  type = 'unknown',
  error,
  title,
  description,
  showRetry = true,
  onRetry,
  showDetails = false,
  fallbackMode = false,
  fallbackMessage,
  className,
}: ErrorStateProps) {
  const config = errorConfig[type]
  const Icon = config.icon
  const errorMessage = typeof error === 'string' ? error : error?.message

  // 降级模式 - 使用 Alert 组件
  if (fallbackMode) {
    return (
      <Alert variant="default" className={cn('border-amber-500/50 bg-amber-500/5', className)}>
        <WifiOff className="size-4 text-amber-600" />
        <AlertTitle className="text-amber-900 dark:text-amber-100">
          {title || '数据服务离线'}
        </AlertTitle>
        <AlertDescription className="text-amber-800 dark:text-amber-200">
          {fallbackMessage || '当前显示本地缓存数据，部分功能可能不可用'}
        </AlertDescription>
      </Alert>
    )
  }

  // 完整错误展示
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center py-12 px-4 text-center',
        className
      )}
    >
      <div className="rounded-full bg-destructive/10 p-4 mb-4">
        <Icon className="size-8 text-destructive" />
      </div>

      <h3 className="text-lg font-medium mb-2">
        {title || config.defaultTitle}
      </h3>

      <p className="text-sm text-muted-foreground max-w-sm mb-4">
        {description || config.defaultDescription}
      </p>

      {showDetails && errorMessage && (
        <div className="mb-4 max-w-md">
          <Alert variant="destructive">
            <AlertDescription className="text-xs font-mono text-left">
              {errorMessage}
            </AlertDescription>
          </Alert>
        </div>
      )}

      {showRetry && onRetry && (
        <Button onClick={onRetry} variant="outline" className="gap-2">
          <RefreshCw className="size-4" />
          重试
        </Button>
      )}
    </div>
  )
}
