'use client'

import { Search, X } from 'lucide-react'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'

export interface FilterOption {
  label: string
  value: string
  count?: number
}

export interface FilterBarProps {
  searchValue?: string
  onSearchChange?: (value: string) => void
  selectedCategories?: string[]
  onCategoryToggle?: (category: string) => void
  categoryOptions?: FilterOption[]
  sortValue?: string
  onSortChange?: (value: string) => void
  sortOptions?: FilterOption[]
  className?: string
}

export function FilterBar({
  searchValue = '',
  onSearchChange,
  selectedCategories = [],
  onCategoryToggle,
  categoryOptions = [],
  sortValue = 'time_desc',
  onSortChange,
  sortOptions = [
    { label: '最新优先', value: 'time_desc' },
    { label: '影响力优先', value: 'impact_desc' },
    { label: '相关度优先', value: 'relevance_desc' },
  ],
  className,
}: FilterBarProps) {
  return (
    <div className={cn('space-y-3', className)}>
      {/* 搜索框和排序 */}
      <div className="flex items-center gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
          <Input
            type="search"
            placeholder="搜索事件标题、来源或关键词..."
            value={searchValue}
            onChange={(e) => onSearchChange?.(e.target.value)}
            className="pl-8"
          />
        </div>

        <Select
          value={sortValue}
          onValueChange={(value) => {
            if (value && onSortChange) {
              onSortChange(value)
            }
          }}
        >
          <SelectTrigger className="w-[140px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {sortOptions.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* 分类筛选标签 */}
      {categoryOptions.length > 0 && (
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-sm text-muted-foreground">筛选:</span>
          {categoryOptions.map((category) => {
            const isSelected = selectedCategories.includes(category.value)
            return (
              <Badge
                key={category.value}
                variant={isSelected ? 'default' : 'outline'}
                className={cn(
                  'cursor-pointer transition-colors',
                  isSelected && 'bg-primary text-primary-foreground'
                )}
                onClick={() => onCategoryToggle?.(category.value)}
              >
                {category.label}
                {category.count !== undefined && (
                  <span className="ml-1 opacity-70">({category.count})</span>
                )}
              </Badge>
            )
          })}
          {selectedCategories.length > 0 && (
            <button
              onClick={() => selectedCategories.forEach((cat) => onCategoryToggle?.(cat))}
              className="text-xs text-muted-foreground hover:text-foreground transition-colors flex items-center gap-1"
            >
              <X className="size-3" />
              清除筛选
            </button>
          )}
        </div>
      )}
    </div>
  )
}
