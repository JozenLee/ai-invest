'use client'

import { useState, useEffect } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  ChevronDown,
  ChevronUp,
  TrendingUp,
  BarChart3,
  Loader2,
} from 'lucide-react'

interface ETFBinding {
  id: string
  etfCode: string
  etfName: string
  weight: number
  description?: string
}

interface IndexBinding {
  id: string
  indexCode: string
  indexName: string
  relevance: number
  description?: string
}

interface NodeETFIndexDisplayProps {
  nodeId: string
  nodeName: string
}

export function NodeETFIndexDisplay({ nodeId, nodeName }: NodeETFIndexDisplayProps) {
  const [etfs, setEtfs] = useState<ETFBinding[]>([])
  const [indices, setIndices] = useState<IndexBinding[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [showETFs, setShowETFs] = useState(false)
  const [showIndices, setShowIndices] = useState(false)

  useEffect(() => {
    fetchBindings()
  }, [nodeId])

  const fetchBindings = async () => {
    setIsLoading(true)
    try {
      const [etfResponse, indexResponse] = await Promise.all([
        fetch(`/api/graph/nodes/${nodeId}/etfs`),
        fetch(`/api/graph/nodes/${nodeId}/indices`),
      ])

      if (etfResponse.ok) {
        const etfData = await etfResponse.json()
        if (etfData.success) {
          setEtfs(etfData.data.filter((e: ETFBinding) => e.etfCode && e.etfName))
        }
      }

      if (indexResponse.ok) {
        const indexData = await indexResponse.json()
        if (indexData.success) {
          setIndices(indexData.data.filter((i: IndexBinding) => i.indexCode && i.indexName))
        }
      }
    } catch (error) {
      console.error('获取ETF/指数绑定失败:', error)
    } finally {
      setIsLoading(false)
    }
  }

  if (isLoading) {
    return (
      <div className="space-y-2">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          <span>加载关联ETF/指数...</span>
        </div>
      </div>
    )
  }

  if (etfs.length === 0 && indices.length === 0) {
    return null
  }

  return (
    <div className="space-y-3 mt-4 pt-4 border-t">
      {/* ETF列表 */}
      {etfs.length > 0 && (
        <div>
          <button
            onClick={() => setShowETFs(!showETFs)}
            className="flex items-center justify-between w-full text-sm font-medium hover:text-primary transition-colors"
          >
            <div className="flex items-center gap-2">
              <TrendingUp className="h-4 w-4 text-primary" />
              <span>关联ETF ({etfs.length})</span>
            </div>
            {showETFs ? (
              <ChevronUp className="h-4 w-4" />
            ) : (
              <ChevronDown className="h-4 w-4" />
            )}
          </button>

          {showETFs && (
            <div className="mt-2 space-y-2 pl-6">
              {etfs.map((etf) => (
                <div
                  key={etf.id}
                  className="flex items-start justify-between p-2 rounded-lg bg-muted/50 hover:bg-muted transition-colors"
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <Badge variant="secondary" className="font-mono text-xs">
                        {etf.etfCode}
                      </Badge>
                      <span className="text-sm font-medium truncate">
                        {etf.etfName}
                      </span>
                    </div>
                    {etf.description && (
                      <p className="text-xs text-muted-foreground mt-1">
                        {etf.description}
                      </p>
                    )}
                  </div>
                  {etf.weight !== 1 && (
                    <Badge variant="outline" className="ml-2 text-xs shrink-0">
                      {(etf.weight * 100).toFixed(0)}%
                    </Badge>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* 指数列表 */}
      {indices.length > 0 && (
        <div>
          <button
            onClick={() => setShowIndices(!showIndices)}
            className="flex items-center justify-between w-full text-sm font-medium hover:text-primary transition-colors"
          >
            <div className="flex items-center gap-2">
              <BarChart3 className="h-4 w-4 text-primary" />
              <span>关联指数 ({indices.length})</span>
            </div>
            {showIndices ? (
              <ChevronUp className="h-4 w-4" />
            ) : (
              <ChevronDown className="h-4 w-4" />
            )}
          </button>

          {showIndices && (
            <div className="mt-2 space-y-2 pl-6">
              {indices.map((index) => (
                <div
                  key={index.id}
                  className="flex items-start justify-between p-2 rounded-lg bg-muted/50 hover:bg-muted transition-colors"
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <Badge variant="secondary" className="font-mono text-xs">
                        {index.indexCode}
                      </Badge>
                      <span className="text-sm font-medium truncate">
                        {index.indexName}
                      </span>
                    </div>
                    {index.description && (
                      <p className="text-xs text-muted-foreground mt-1">
                        {index.description}
                      </p>
                    )}
                  </div>
                  {index.relevance !== 1 && (
                    <Badge variant="outline" className="ml-2 text-xs shrink-0">
                      {(index.relevance * 100).toFixed(0)}%
                    </Badge>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
