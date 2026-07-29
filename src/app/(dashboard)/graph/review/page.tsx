'use client'

import { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { toast } from 'sonner'
import { SuggestionList } from '@/components/graph/SuggestionList'
import { SuggestionDetail } from '@/components/graph/SuggestionDetail'
import { CheckCircle2, XCircle, RefreshCw } from 'lucide-react'

interface GraphSuggestion {
  id: string
  type: string
  targetType: string
  data: string
  confidence: number
  source: string
  status: string
  evidence?: string
  createdAt: string
}

export default function GraphReviewPage() {
  const [suggestions, setSuggestions] = useState<GraphSuggestion[]>([])
  const [selectedIds, setSelectedIds] = useState<string[]>([])
  const [selectedSuggestion, setSelectedSuggestion] = useState<GraphSuggestion | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  // Fetch suggestions
  const fetchSuggestions = async () => {
    setIsLoading(true)
    try {
      const response = await fetch('/api/graph/suggestions?status=pending')
      const data = await response.json()

      if (data.success) {
        setSuggestions(data.data.suggestions)
      } else {
        toast.error('加载失败', {
          description: data.error
        })
      }
    } catch (error) {
      toast.error('加载失败', {
        description: String(error)
      })
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    fetchSuggestions()
  }, [])

  // Batch approve
  const handleBatchApprove = async () => {
    if (selectedIds.length === 0) {
      toast.error('请选择建议', {
        description: '至少选择一个建议进行批准'
      })
      return
    }

    try {
      const response = await fetch('/api/graph/suggestions/batch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'approve',
          suggestionIds: selectedIds,
          reviewedBy: 'current-user' // TODO: Get from auth
        })
      })

      const data = await response.json()

      if (data.success) {
        toast.success('批准成功', {
          description: `已批准 ${data.data.approvedCount} 个建议`
        })

        // Refresh list
        await fetchSuggestions()
        setSelectedIds([])
        setSelectedSuggestion(null)
      } else {
        toast.error('批准失败', {
          description: data.error
        })
      }
    } catch (error) {
      toast.error('批准失败', {
        description: String(error)
      })
    }
  }

  // Batch reject
  const handleBatchReject = async () => {
    if (selectedIds.length === 0) {
      toast.error('请选择建议', {
        description: '至少选择一个建议进行拒绝'
      })
      return
    }

    try {
      const response = await fetch('/api/graph/suggestions/batch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'reject',
          suggestionIds: selectedIds,
          reviewedBy: 'current-user',
          note: '批量拒绝'
        })
      })

      const data = await response.json()

      if (data.success) {
        toast.success('拒绝成功', {
          description: `已拒绝 ${data.data.rejectedCount} 个建议`
        })

        // Refresh list
        await fetchSuggestions()
        setSelectedIds([])
        setSelectedSuggestion(null)
      } else {
        toast.error('拒绝失败', {
          description: data.error
        })
      }
    } catch (error) {
      toast.error('拒绝失败', {
        description: String(error)
      })
    }
  }

  // Single approve
  const handleApprove = async (id: string) => {
    try {
      const response = await fetch(`/api/graph/suggestions/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'approve',
          reviewedBy: 'current-user'
        })
      })

      const data = await response.json()

      if (data.success) {
        toast.success('批准成功', {
          description: '建议已应用到知识图谱'
        })

        await fetchSuggestions()
        setSelectedSuggestion(null)
      } else {
        toast.error('批准失败', {
          description: data.error
        })
      }
    } catch (error) {
      toast.error('批准失败', {
        description: String(error)
      })
    }
  }

  // Single reject
  const handleReject = async (id: string) => {
    try {
      const response = await fetch(`/api/graph/suggestions/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'reject',
          reviewedBy: 'current-user',
          note: '手动拒绝'
        })
      })

      const data = await response.json()

      if (data.success) {
        toast.success('拒绝成功')

        await fetchSuggestions()
        setSelectedSuggestion(null)
      } else {
        toast.error('拒绝失败', {
          description: data.error
        })
      }
    } catch (error) {
      toast.error('拒绝失败', {
        description: String(error)
      })
    }
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">图谱审核</h1>
          <p className="text-muted-foreground">
            审核AI建议，应用到知识图谱
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={fetchSuggestions}
          disabled={isLoading}
        >
          <RefreshCw className={`mr-2 h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
          刷新
        </Button>
      </div>

      {/* Batch actions */}
      {selectedIds.length > 0 && (
        <div className="flex items-center gap-2 rounded-lg border bg-muted/50 p-4">
          <span className="text-sm font-medium">已选择 {selectedIds.length} 个建议</span>
          <div className="ml-auto flex gap-2">
            <Button size="sm" onClick={handleBatchApprove}>
              <CheckCircle2 className="mr-1 h-4 w-4" />
              批量批准
            </Button>
            <Button size="sm" variant="destructive" onClick={handleBatchReject}>
              <XCircle className="mr-1 h-4 w-4" />
              批量拒绝
            </Button>
          </div>
        </div>
      )}

      {/* Main content */}
      <div className="grid gap-6 lg:grid-cols-[1fr_400px]">
        {/* Left: Suggestion list */}
        <div>
          {isLoading ? (
            <div className="flex h-96 items-center justify-center">
              <RefreshCw className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <SuggestionList
              suggestions={suggestions}
              selectedIds={selectedIds}
              onSelectionChange={setSelectedIds}
              onSuggestionClick={setSelectedSuggestion}
            />
          )}
        </div>

        {/* Right: Detail panel */}
        <div className="lg:sticky lg:top-6 lg:h-fit">
          <SuggestionDetail
            suggestion={selectedSuggestion}
            onApprove={handleApprove}
            onReject={handleReject}
          />
        </div>
      </div>
    </div>
  )
}
