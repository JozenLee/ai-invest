'use client'

import { useState, useMemo } from 'react'
import { Checkbox } from '@/components/ui/checkbox'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { CheckCircle2, XCircle, Clock, TrendingUp } from 'lucide-react'

interface GraphSuggestion {
  id: string
  type: string
  targetType: string
  data: string
  confidence: number
  source: string
  status: string
  createdAt: string
  evidence?: string
}

interface SuggestionListProps {
  suggestions: GraphSuggestion[]
  selectedIds?: string[]
  onSelectionChange?: (selectedIds: string[]) => void
  onSuggestionClick?: (suggestion: GraphSuggestion) => void
}

export function SuggestionList({
  suggestions,
  selectedIds = [],
  onSelectionChange,
  onSuggestionClick
}: SuggestionListProps) {
  const [filters, setFilters] = useState<{
    type: string
    source: string
    minConfidence: number
  }>({
    type: 'all',
    source: 'all',
    minConfidence: 0
  })

  // Filter suggestions
  const filteredSuggestions = useMemo(() => {
    return suggestions.filter(s => {
      if (filters.type !== 'all' && s.type !== filters.type) return false
      if (filters.source !== 'all' && s.source !== filters.source) return false
      if (s.confidence < filters.minConfidence) return false
      return true
    })
  }, [suggestions, filters])

  // Selection handlers
  const handleSelectAll = (checked: boolean) => {
    if (checked) {
      onSelectionChange?.(filteredSuggestions.map(s => s.id))
    } else {
      onSelectionChange?.([])
    }
  }

  const handleSelectOne = (id: string, checked: boolean) => {
    if (checked) {
      onSelectionChange?.([...selectedIds, id])
    } else {
      onSelectionChange?.(selectedIds.filter(sid => sid !== id))
    }
  }

  const isAllSelected = filteredSuggestions.length > 0 &&
    filteredSuggestions.every(s => selectedIds.includes(s.id))

  // Parse data helper
  const parseData = (dataStr: string) => {
    try {
      return JSON.parse(dataStr)
    } catch {
      return {}
    }
  }

  // Get confidence color
  const getConfidenceColor = (confidence: number) => {
    if (confidence >= 0.9) return 'text-green-600'
    if (confidence >= 0.7) return 'text-blue-600'
    if (confidence >= 0.5) return 'text-yellow-600'
    return 'text-red-600'
  }

  // Get type badge
  const getTypeBadge = (type: string) => {
    const typeMap: Record<string, { label: string; variant: 'default' | 'secondary' }> = {
      add_node: { label: '新增节点', variant: 'default' },
      add_edge: { label: '新增关系', variant: 'secondary' },
      update_node: { label: '更新节点', variant: 'default' },
      update_edge: { label: '更新关系', variant: 'secondary' }
    }
    const config = typeMap[type] || { label: type, variant: 'default' }
    return <Badge variant={config.variant}>{config.label}</Badge>
  }

  // Get source badge
  const getSourceBadge = (source: string) => {
    const sourceMap: Record<string, string> = {
      ai_extraction: 'AI抽取',
      rule_inference: '规则推理',
      market_data: '市场数据'
    }
    return <Badge variant="outline">{sourceMap[source] || source}</Badge>
  }

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="flex gap-4">
        <div className="flex-1">
          <Label htmlFor="type-filter">类型</Label>
          <Select
            value={filters.type}
            onValueChange={(value) => setFilters({ ...filters, type: value || 'all' })}
          >
            <SelectTrigger id="type-filter">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">全部</SelectItem>
              <SelectItem value="add_node">新增节点</SelectItem>
              <SelectItem value="add_edge">新增关系</SelectItem>
              <SelectItem value="update_node">更新节点</SelectItem>
              <SelectItem value="update_edge">更新关系</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="flex-1">
          <Label htmlFor="source-filter">来源</Label>
          <Select
            value={filters.source}
            onValueChange={(value) => setFilters({ ...filters, source: value || 'all' })}
          >
            <SelectTrigger id="source-filter">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">全部</SelectItem>
              <SelectItem value="ai_extraction">AI抽取</SelectItem>
              <SelectItem value="rule_inference">规则推理</SelectItem>
              <SelectItem value="market_data">市场数据</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="w-32">
          <Label htmlFor="confidence-filter">最低置信度</Label>
          <Input
            id="confidence-filter"
            type="number"
            min="0"
            max="1"
            step="0.1"
            value={filters.minConfidence}
            onChange={(e) => setFilters({ ...filters, minConfidence: parseFloat(e.target.value) })}
          />
        </div>
      </div>

      {/* Select all */}
      <div className="flex items-center gap-2">
        <Checkbox
          id="select-all"
          checked={isAllSelected}
          onCheckedChange={handleSelectAll}
        />
        <Label htmlFor="select-all" className="cursor-pointer">
          全选 ({selectedIds.length}/{filteredSuggestions.length})
        </Label>
      </div>

      {/* Suggestions list */}
      <div className="space-y-2">
        {filteredSuggestions.length === 0 ? (
          <div className="py-8 text-center text-muted-foreground">
            暂无建议
          </div>
        ) : (
          filteredSuggestions.map((suggestion) => {
            const data = parseData(suggestion.data)
            const isSelected = selectedIds.includes(suggestion.id)

            return (
              <div
                key={suggestion.id}
                className={`rounded-lg border p-4 cursor-pointer transition-colors ${
                  isSelected ? 'border-primary bg-primary/5' : 'hover:bg-muted/50'
                }`}
                onClick={() => onSuggestionClick?.(suggestion)}
              >
                <div className="flex items-start gap-3">
                  <Checkbox
                    checked={isSelected}
                    onCheckedChange={(checked) => handleSelectOne(suggestion.id, checked as boolean)}
                    onClick={(e) => e.stopPropagation()}
                  />

                  <div className="flex-1 space-y-2">
                    {/* Header */}
                    <div className="flex items-center gap-2">
                      {getTypeBadge(suggestion.type)}
                      {getSourceBadge(suggestion.source)}
                      <span className={`text-sm font-medium ${getConfidenceColor(suggestion.confidence)}`}>
                        <TrendingUp className="inline h-3 w-3 mr-1" />
                        {(suggestion.confidence * 100).toFixed(0)}%
                      </span>
                    </div>

                    {/* Content */}
                    <div className="text-sm">
                      {suggestion.type.includes('node') && (
                        <div>
                          <span className="font-medium">{data.name}</span>
                          <span className="text-muted-foreground ml-2">({data.type})</span>
                          {data.description && (
                            <p className="mt-1 text-muted-foreground">{data.description}</p>
                          )}
                        </div>
                      )}

                      {suggestion.type.includes('edge') && (
                        <div>
                          <span className="font-medium">{data.source}</span>
                          <span className="mx-2">→</span>
                          <span className="font-medium">{data.target}</span>
                          <span className="ml-2 text-muted-foreground">({data.relation})</span>
                          {data.weight && (
                            <span className="ml-2 text-xs">权重 {data.weight.toFixed(2)}</span>
                          )}
                        </div>
                      )}
                    </div>

                    {/* Footer */}
                    <div className="flex items-center gap-4 text-xs text-muted-foreground">
                      <span>
                        <Clock className="inline h-3 w-3 mr-1" />
                        {new Date(suggestion.createdAt).toLocaleString('zh-CN')}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            )
          })
        )}
      </div>
    </div>
  )
}
