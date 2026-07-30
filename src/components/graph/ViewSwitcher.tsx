'use client'

import { useState, useEffect } from 'react'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import type { GraphView } from '@/lib/services/graph-view.service'

interface ViewSwitcherProps {
  currentView: string
  onViewChange: (viewId: string) => void
}

export function ViewSwitcher({ currentView, onViewChange }: ViewSwitcherProps) {
  const [views, setViews] = useState<GraphView[]>([])
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    fetch('/api/graph/views')
      .then(res => res.json())
      .then(data => {
        if (data.success) {
          setViews(data.data)
        }
      })
      .catch(error => console.error('加载视角失败:', error))
      .finally(() => setIsLoading(false))
  }, [])

  if (isLoading) {
    return <div className="text-sm text-muted-foreground">加载中...</div>
  }

  return (
    <div className="flex items-center gap-2">
      <span className="text-sm font-medium">视角:</span>
      <Select value={currentView} onValueChange={(value) => value && onViewChange(value)}>
        <SelectTrigger className="w-[180px]">
          <SelectValue placeholder="选择视角" />
        </SelectTrigger>
        <SelectContent>
          {views.map(view => (
            <SelectItem key={view.id} value={view.id}>
              <div>
                <div className="font-medium">{view.name}</div>
                <div className="text-xs text-muted-foreground">
                  {view.description}
                </div>
              </div>
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  )
}
