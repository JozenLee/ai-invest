import { Activity, Archive, Cloud, Database, Loader2, Radio, TriangleAlert } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import type { SourceDisplay, StatusBadge } from '@/types/market'

export function MarketStatusBadge({
  statusBadge,
  isRealtime,
}: {
  statusBadge: StatusBadge
  isRealtime?: boolean
}) {
  const Icon = isRealtime ? Radio : statusBadge.icon === 'loader' ? Loader2 : Activity
  const label =
    ['获取中...', '订阅数据库快照'].includes(statusBadge.label)
      ? statusBadge.label
      : isRealtime
        ? '实时数据'
        : '收盘数据'

  return (
    <Badge variant={statusBadge.variant} className="gap-1.5">
      <Icon className={isRealtime ? 'size-3 text-emerald-500' : 'size-3'} aria-hidden="true" />
      {label}
    </Badge>
  )
}

export function DataSourceBadge({ sourceDisplay }: { sourceDisplay: SourceDisplay }) {
  return (
    <Badge variant={sourceDisplay.variant} className="gap-1.5">
      {sourceDisplay.icon === 'cloud' && <Cloud className="size-3" aria-hidden="true" />}
      {sourceDisplay.icon === 'archive' && <Archive className="size-3" aria-hidden="true" />}
      {sourceDisplay.icon === 'alert' && <TriangleAlert className="size-3" aria-hidden="true" />}
      {sourceDisplay.icon === 'loader' && <Loader2 className="size-3 animate-spin" aria-hidden="true" />}
      {sourceDisplay.icon === 'database' && <Database className="size-3" aria-hidden="true" />}
      {sourceDisplay.text}
    </Badge>
  )
}
