'use client'

import { useState } from 'react'
import { ChevronRight, ChevronDown, Tag as TagIcon, Plus, Edit2, Trash2 } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

export interface TagTreeNode {
  id: string
  name: string
  code: string
  type: string
  level: number
  parentId: string | null
  children: TagTreeNode[]
  isActive: boolean
  _count?: {
    newsArticles: number
    graphNodes: number
  }
}

interface TagTreeProps {
  data: TagTreeNode[]
  onEdit?: (tag: TagTreeNode) => void
  onDelete?: (tag: TagTreeNode) => void
  onAddChild?: (parentTag: TagTreeNode) => void
  selectable?: boolean
  selectedIds?: string[]
  onSelect?: (tagId: string) => void
}

const TAG_TYPE_COLORS: Record<string, string> = {
  domain: 'bg-blue-100 text-blue-800',
  tech: 'bg-purple-100 text-purple-800',
  company: 'bg-green-100 text-green-800',
  concept: 'bg-orange-100 text-orange-800',
}

const TAG_TYPE_LABELS: Record<string, string> = {
  domain: '领域',
  tech: '技术',
  company: '公司',
  concept: '概念',
}

function TagTreeItem({
  node,
  level = 0,
  onEdit,
  onDelete,
  onAddChild,
  selectable,
  selectedIds = [],
  onSelect,
}: {
  node: TagTreeNode
  level?: number
  onEdit?: (tag: TagTreeNode) => void
  onDelete?: (tag: TagTreeNode) => void
  onAddChild?: (parentTag: TagTreeNode) => void
  selectable?: boolean
  selectedIds?: string[]
  onSelect?: (tagId: string) => void
}) {
  const [isExpanded, setIsExpanded] = useState(level < 2) // 默认展开前两层
  const hasChildren = node.children && node.children.length > 0
  const isSelected = selectedIds.includes(node.id)

  return (
    <div className="select-none">
      <div
        className={cn(
          'flex items-center gap-2 py-2 px-3 rounded-md hover:bg-accent transition-colors group',
          isSelected && 'bg-accent',
          selectable && 'cursor-pointer'
        )}
        style={{ paddingLeft: `${level * 20 + 12}px` }}
        onClick={() => selectable && onSelect?.(node.id)}
      >
        {/* 展开/收起按钮 */}
        {hasChildren ? (
          <button
            onClick={(e) => {
              e.stopPropagation()
              setIsExpanded(!isExpanded)
            }}
            className="p-0.5 hover:bg-accent-foreground/10 rounded"
          >
            {isExpanded ? (
              <ChevronDown className="h-4 w-4" />
            ) : (
              <ChevronRight className="h-4 w-4" />
            )}
          </button>
        ) : (
          <div className="w-5" />
        )}

        {/* 标签图标 */}
        <TagIcon className="h-4 w-4 text-muted-foreground" />

        {/* 标签名称 */}
        <span className="font-medium flex-1">{node.name}</span>

        {/* 标签类型 */}
        <Badge variant="outline" className={cn('text-xs', TAG_TYPE_COLORS[node.type])}>
          {TAG_TYPE_LABELS[node.type] || node.type}
        </Badge>

        {/* 代码 */}
        <code className="text-xs text-muted-foreground bg-muted px-2 py-0.5 rounded">
          {node.code}
        </code>

        {/* 统计数据 */}
        {node._count && (
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            {node._count.newsArticles > 0 && (
              <span title="关联新闻数">📰 {node._count.newsArticles}</span>
            )}
            {node._count.graphNodes > 0 && (
              <span title="关联节点数">🔗 {node._count.graphNodes}</span>
            )}
          </div>
        )}

        {/* 操作按钮 */}
        {(onEdit || onDelete || onAddChild) && (
          <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
            {onAddChild && (
              <Button
                variant="ghost"
                size="sm"
                className="h-7 w-7 p-0"
                onClick={(e) => {
                  e.stopPropagation()
                  onAddChild(node)
                }}
                title="添加子标签"
              >
                <Plus className="h-3 w-3" />
              </Button>
            )}
            {onEdit && (
              <Button
                variant="ghost"
                size="sm"
                className="h-7 w-7 p-0"
                onClick={(e) => {
                  e.stopPropagation()
                  onEdit(node)
                }}
                title="编辑"
              >
                <Edit2 className="h-3 w-3" />
              </Button>
            )}
            {onDelete && (
              <Button
                variant="ghost"
                size="sm"
                className="h-7 w-7 p-0 text-destructive hover:text-destructive"
                onClick={(e) => {
                  e.stopPropagation()
                  onDelete(node)
                }}
                title="删除"
              >
                <Trash2 className="h-3 w-3" />
              </Button>
            )}
          </div>
        )}
      </div>

      {/* 子节点 */}
      {hasChildren && isExpanded && (
        <div>
          {node.children.map((child) => (
            <TagTreeItem
              key={child.id}
              node={child}
              level={level + 1}
              onEdit={onEdit}
              onDelete={onDelete}
              onAddChild={onAddChild}
              selectable={selectable}
              selectedIds={selectedIds}
              onSelect={onSelect}
            />
          ))}
        </div>
      )}
    </div>
  )
}

export function TagTree({
  data,
  onEdit,
  onDelete,
  onAddChild,
  selectable = false,
  selectedIds = [],
  onSelect,
}: TagTreeProps) {
  if (!data || data.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
        <TagIcon className="h-12 w-12 mb-4" />
        <p>暂无标签</p>
      </div>
    )
  }

  return (
    <div className="space-y-1">
      {data.map((node) => (
        <TagTreeItem
          key={node.id}
          node={node}
          onEdit={onEdit}
          onDelete={onDelete}
          onAddChild={onAddChild}
          selectable={selectable}
          selectedIds={selectedIds}
          onSelect={onSelect}
        />
      ))}
    </div>
  )
}
