'use client'

import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Badge } from '@/components/ui/badge'
import {
  LayoutGrid,
  Filter,
  RefreshCw,
  Download,
  ZoomIn,
  ZoomOut,
  Maximize2,
  Eye,
  Route
} from 'lucide-react'

export type GraphView = 'full' | 'hot' | 'cycle' | 'momentum' | 'supply_chain'

interface GraphToolbarProps {
  currentView: GraphView
  onViewChange: (view: GraphView) => void
  onRefresh: () => void
  onZoomIn: () => void
  onZoomOut: () => void
  onFitView: () => void
  onExport?: () => void
  onToggleFilters: () => void
  showFilters: boolean
  filterCount?: number
}

const VIEW_LABELS: Record<GraphView, { label: string, icon: React.ReactNode }> = {
  full: { label: '全景视图', icon: <LayoutGrid className="h-4 w-4" /> },
  hot: { label: '热点视图', icon: <Eye className="h-4 w-4" /> },
  cycle: { label: '周期视图', icon: <RefreshCw className="h-4 w-4" /> },
  momentum: { label: '动量视图', icon: <ZoomIn className="h-4 w-4" /> },
  supply_chain: { label: '供应链视图', icon: <Route className="h-4 w-4" /> }
}

export function GraphToolbar({
  currentView,
  onViewChange,
  onRefresh,
  onZoomIn,
  onZoomOut,
  onFitView,
  onExport,
  onToggleFilters,
  showFilters,
  filterCount = 0
}: GraphToolbarProps) {
  return (
    <div className="flex items-center justify-between rounded-lg border bg-card p-3 shadow-sm">
      {/* Left: View Selector */}
      <div className="flex items-center gap-2">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm" className="gap-2">
              {VIEW_LABELS[currentView].icon}
              {VIEW_LABELS[currentView].label}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start">
            <DropdownMenuLabel>视角切换</DropdownMenuLabel>
            <DropdownMenuSeparator />
            {(Object.entries(VIEW_LABELS) as [GraphView, typeof VIEW_LABELS[GraphView]][]).map(([view, { label, icon }]) => (
              <DropdownMenuItem
                key={view}
                onClick={() => onViewChange(view)}
                className="gap-2"
              >
                {icon}
                {label}
                {view === currentView && (
                  <Badge variant="secondary" className="ml-auto">
                    当前
                  </Badge>
                )}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>

        <Button
          variant={showFilters ? 'default' : 'outline'}
          size="sm"
          onClick={onToggleFilters}
          className="gap-2"
        >
          <Filter className="h-4 w-4" />
          筛选
          {filterCount > 0 && (
            <Badge variant="secondary" className="ml-1">
              {filterCount}
            </Badge>
          )}
        </Button>
      </div>

      {/* Right: Actions */}
      <div className="flex items-center gap-2">
        {/* Zoom Controls */}
        <div className="flex items-center gap-1 rounded-md border">
          <Button
            variant="ghost"
            size="sm"
            onClick={onZoomIn}
            className="h-8 w-8 p-0"
            title="放大"
          >
            <ZoomIn className="h-4 w-4" />
          </Button>
          <div className="h-4 w-px bg-border" />
          <Button
            variant="ghost"
            size="sm"
            onClick={onZoomOut}
            className="h-8 w-8 p-0"
            title="缩小"
          >
            <ZoomOut className="h-4 w-4" />
          </Button>
          <div className="h-4 w-px bg-border" />
          <Button
            variant="ghost"
            size="sm"
            onClick={onFitView}
            className="h-8 w-8 p-0"
            title="适应视图"
          >
            <Maximize2 className="h-4 w-4" />
          </Button>
        </div>

        {/* Refresh */}
        <Button
          variant="outline"
          size="sm"
          onClick={onRefresh}
          className="gap-2"
        >
          <RefreshCw className="h-4 w-4" />
          刷新
        </Button>

        {/* Export */}
        {onExport && (
          <Button
            variant="outline"
            size="sm"
            onClick={onExport}
            className="gap-2"
          >
            <Download className="h-4 w-4" />
            导出
          </Button>
        )}
      </div>
    </div>
  )
}
