import { cn } from '@/lib/utils'

export interface LoadingSkeletonProps {
  variant?: 'feed' | 'card' | 'table' | 'detail'
  count?: number
  className?: string
}

function SkeletonBox({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        'animate-pulse rounded-md bg-muted/50',
        className
      )}
    />
  )
}

function FeedItemSkeleton() {
  return (
    <div className="border rounded-lg p-4 space-y-3">
      {/* 头部 - 标题和标签 */}
      <div className="space-y-2">
        <SkeletonBox className="h-5 w-3/4" />
        <div className="flex gap-2">
          <SkeletonBox className="h-5 w-16" />
          <SkeletonBox className="h-5 w-16" />
          <SkeletonBox className="h-5 w-20" />
        </div>
      </div>

      {/* 内容摘要 */}
      <div className="space-y-2">
        <SkeletonBox className="h-4 w-full" />
        <SkeletonBox className="h-4 w-5/6" />
      </div>

      {/* 底部信息 */}
      <div className="flex items-center justify-between pt-2">
        <SkeletonBox className="h-4 w-32" />
        <SkeletonBox className="h-4 w-24" />
      </div>
    </div>
  )
}

function CardSkeleton() {
  return (
    <div className="border rounded-lg p-4 space-y-4">
      <div className="flex items-start justify-between">
        <SkeletonBox className="h-6 w-32" />
        <SkeletonBox className="h-5 w-16" />
      </div>

      <div className="space-y-2">
        <SkeletonBox className="h-4 w-full" />
        <SkeletonBox className="h-4 w-4/5" />
      </div>

      <div className="flex gap-2">
        <SkeletonBox className="h-8 flex-1" />
        <SkeletonBox className="h-8 flex-1" />
      </div>
    </div>
  )
}

function TableRowSkeleton() {
  return (
    <div className="flex items-center gap-4 py-3 border-b">
      <SkeletonBox className="h-4 w-1/4" />
      <SkeletonBox className="h-4 w-1/6" />
      <SkeletonBox className="h-4 w-1/6" />
      <SkeletonBox className="h-4 w-1/6" />
      <SkeletonBox className="h-4 w-1/6" />
    </div>
  )
}

function DetailSkeleton() {
  return (
    <div className="space-y-6">
      {/* 标题区 */}
      <div className="space-y-3">
        <SkeletonBox className="h-8 w-2/3" />
        <div className="flex gap-3">
          <SkeletonBox className="h-5 w-20" />
          <SkeletonBox className="h-5 w-20" />
          <SkeletonBox className="h-5 w-24" />
        </div>
      </div>

      {/* 元数据 */}
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <SkeletonBox className="h-4 w-16" />
          <SkeletonBox className="h-5 w-full" />
        </div>
        <div className="space-y-2">
          <SkeletonBox className="h-4 w-16" />
          <SkeletonBox className="h-5 w-full" />
        </div>
      </div>

      {/* 内容区 */}
      <div className="space-y-3">
        <SkeletonBox className="h-5 w-24" />
        <div className="space-y-2">
          <SkeletonBox className="h-4 w-full" />
          <SkeletonBox className="h-4 w-full" />
          <SkeletonBox className="h-4 w-11/12" />
          <SkeletonBox className="h-4 w-full" />
          <SkeletonBox className="h-4 w-4/5" />
        </div>
      </div>

      {/* 分析区 */}
      <div className="space-y-3">
        <SkeletonBox className="h-5 w-24" />
        <div className="border rounded-lg p-4 space-y-3">
          <SkeletonBox className="h-4 w-full" />
          <SkeletonBox className="h-4 w-full" />
          <SkeletonBox className="h-4 w-3/4" />
        </div>
      </div>
    </div>
  )
}

export function LoadingSkeleton({
  variant = 'feed',
  count = 3,
  className,
}: LoadingSkeletonProps) {
  const skeletonComponents = {
    feed: FeedItemSkeleton,
    card: CardSkeleton,
    table: TableRowSkeleton,
    detail: DetailSkeleton,
  }

  const Component = skeletonComponents[variant]

  if (variant === 'detail') {
    return (
      <div className={className}>
        <Component />
      </div>
    )
  }

  return (
    <div className={cn('space-y-4', className)}>
      {Array.from({ length: count }).map((_, i) => (
        <Component key={i} />
      ))}
    </div>
  )
}
