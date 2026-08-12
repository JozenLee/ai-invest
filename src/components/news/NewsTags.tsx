'use client'

import { Badge } from '@/components/ui/badge'
import { Tag as TagIcon } from 'lucide-react'

interface NewsTag {
  newsId: string
  tagId: string
  confidence: number
  tag: {
    id: string
    name: string
    code: string
    type: string
  }
}

interface NewsTagsProps {
  tags: NewsTag[]
  maxDisplay?: number
}

const TAG_TYPE_COLORS: Record<string, string> = {
  domain: 'bg-blue-100 text-blue-800 border-blue-200',
  tech: 'bg-purple-100 text-purple-800 border-purple-200',
  company: 'bg-green-100 text-green-800 border-green-200',
  concept: 'bg-orange-100 text-orange-800 border-orange-200',
  segment: 'bg-indigo-100 text-indigo-800 border-indigo-200',
}

export function NewsTags({ tags, maxDisplay = 5 }: NewsTagsProps) {
  if (!tags || tags.length === 0) {
    return null
  }

  // 按置信度排序
  const sortedTags = [...tags].sort((a, b) => b.confidence - a.confidence)
  const displayTags = sortedTags.slice(0, maxDisplay)
  const remainingCount = sortedTags.length - maxDisplay

  return (
    <div className="flex flex-wrap items-center gap-2">
      <TagIcon className="h-3 w-3 text-muted-foreground" />
      {displayTags.map((newsTag) => (
        <Badge
          key={`${newsTag.newsId}-${newsTag.tagId}`}
          variant="outline"
          className={TAG_TYPE_COLORS[newsTag.tag.type] || 'bg-gray-100 text-gray-800'}
          title={`置信度: ${(newsTag.confidence * 100).toFixed(0)}%`}
        >
          {newsTag.tag.name}
        </Badge>
      ))}
      {remainingCount > 0 && (
        <Badge variant="secondary" className="text-xs">
          +{remainingCount}
        </Badge>
      )}
    </div>
  )
}
