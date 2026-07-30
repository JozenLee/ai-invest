'use client'

import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Slider } from '@/components/ui/slider'
import { Label } from '@/components/ui/label'
import { Separator } from '@/components/ui/separator'
import { X, Filter } from 'lucide-react'

export interface GraphFilters {
  nodeTypes: string[]
  momentumRange: [number, number]
  cyclePositions: string[]
  hasRecentNews: boolean
  minNewsCount: number
}

interface GraphFiltersProps {
  filters: GraphFilters
  onChange: (filters: GraphFilters) => void
  onReset: () => void
  availableTypes: string[]
}

const NODE_TYPE_LABELS: Record<string, string> = {
  index: '指数',
  industry_l1: '一级行业',
  industry_l2: '二级行业',
  sub_sector: '细分板块',
  stock: '个股',
  chip_design: '芯片设计',
  chip_manufacturing: '芯片制造',
  equipment: '设备',
  materials: '材料'
}

const CYCLE_LABELS: Record<string, string> = {
  upturn: '上升期',
  peak: '高位',
  downturn: '下降期',
  trough: '底部',
  neutral: '中性'
}

export function GraphFilters({
  filters,
  onChange,
  onReset,
  availableTypes
}: GraphFiltersProps) {
  const updateFilter = <K extends keyof GraphFilters>(
    key: K,
    value: GraphFilters[K]
  ) => {
    onChange({ ...filters, [key]: value })
  }

  const toggleNodeType = (type: string) => {
    const current = filters.nodeTypes
    const updated = current.includes(type)
      ? current.filter(t => t !== type)
      : [...current, type]
    updateFilter('nodeTypes', updated)
  }

  const toggleCyclePosition = (pos: string) => {
    const current = filters.cyclePositions
    const updated = current.includes(pos)
      ? current.filter(p => p !== pos)
      : [...current, pos]
    updateFilter('cyclePositions', updated)
  }

  const hasActiveFilters =
    filters.nodeTypes.length > 0 ||
    filters.cyclePositions.length > 0 ||
    filters.momentumRange[0] !== -100 ||
    filters.momentumRange[1] !== 100 ||
    filters.hasRecentNews ||
    filters.minNewsCount > 0

  return (
    <div className="space-y-6 rounded-lg border bg-card p-4 text-card-foreground shadow-sm">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Filter className="h-4 w-4" />
          <h3 className="font-semibold">筛选条件</h3>
        </div>
        {hasActiveFilters && (
          <Button
            variant="ghost"
            size="sm"
            onClick={onReset}
            className="h-8 px-2"
          >
            <X className="mr-1 h-3 w-3" />
            清除
          </Button>
        )}
      </div>

      <Separator />

      {/* 节点类型 */}
      <div className="space-y-2">
        <Label className="text-sm font-medium">节点类型</Label>
        <div className="flex flex-wrap gap-2">
          {availableTypes.map(type => (
            <Button
              key={type}
              variant={filters.nodeTypes.includes(type) ? 'default' : 'outline'}
              size="sm"
              onClick={() => toggleNodeType(type)}
              className="h-7 text-xs"
            >
              {NODE_TYPE_LABELS[type] || type}
            </Button>
          ))}
        </div>
      </div>

      <Separator />

      {/* 动量范围 */}
      <div className="space-y-3">
        <Label className="text-sm font-medium">
          动量范围: {filters.momentumRange[0]} ~ {filters.momentumRange[1]}
        </Label>
        <Slider
          min={-100}
          max={100}
          step={10}
          value={filters.momentumRange}
          onValueChange={(value) => updateFilter('momentumRange', value as [number, number])}
          className="w-full"
        />
        <div className="flex justify-between text-xs text-muted-foreground">
          <span>下降期</span>
          <span>上升期</span>
        </div>
      </div>

      <Separator />

      {/* 周期位置 */}
      <div className="space-y-2">
        <Label className="text-sm font-medium">周期位置</Label>
        <div className="flex flex-wrap gap-2">
          {Object.entries(CYCLE_LABELS).map(([pos, label]) => (
            <Button
              key={pos}
              variant={filters.cyclePositions.includes(pos) ? 'default' : 'outline'}
              size="sm"
              onClick={() => toggleCyclePosition(pos)}
              className="h-7 text-xs"
            >
              {label}
            </Button>
          ))}
        </div>
      </div>

      <Separator />

      {/* 新闻相关 */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <Label className="text-sm font-medium">有最近新闻</Label>
          <Button
            variant={filters.hasRecentNews ? 'default' : 'outline'}
            size="sm"
            onClick={() => updateFilter('hasRecentNews', !filters.hasRecentNews)}
            className="h-7 text-xs"
          >
            {filters.hasRecentNews ? '已启用' : '未启用'}
          </Button>
        </div>

        <div className="space-y-2">
          <Label className="text-sm font-medium">
            最少新闻数（7天）: {filters.minNewsCount}
          </Label>
          <Slider
            min={0}
            max={20}
            step={1}
            value={[filters.minNewsCount]}
            onValueChange={(value) => updateFilter('minNewsCount', value[0])}
            className="w-full"
          />
        </div>
      </div>

      {/* 统计信息 */}
      {hasActiveFilters && (
        <>
          <Separator />
          <div className="rounded-lg bg-muted p-3 text-xs text-muted-foreground">
            已应用 {
              [
                filters.nodeTypes.length > 0 && `${filters.nodeTypes.length}种类型`,
                filters.cyclePositions.length > 0 && `${filters.cyclePositions.length}个周期`,
                (filters.momentumRange[0] !== -100 || filters.momentumRange[1] !== 100) && '动量范围',
                filters.hasRecentNews && '有新闻',
                filters.minNewsCount > 0 && `新闻≥${filters.minNewsCount}`
              ].filter(Boolean).join('、')
            } 筛选条件
          </div>
        </>
      )}
    </div>
  )
}
