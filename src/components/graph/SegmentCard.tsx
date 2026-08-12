'use client'

import { useState, useEffect } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { ChevronDown, ChevronRight, Building2, Sparkles, TrendingUp, BarChart3 } from 'lucide-react'
import { CompanyCard } from './CompanyCard'
import { NodeETFIndexDisplay } from './NodeETFIndexDisplay'
import type { Segment } from '@/types/industry-graph'

interface ETFMatch {
  code: string
  name: string
  relevance: number
  reasoning: string
}

interface IndexMatch {
  code: string
  name: string
  relevance: number
  reasoning: string
}

interface SegmentCardProps {
  segment: Segment
  onCompanyClick?: (companyId: string) => void
  initialMatchResult?: {
    nodeId: string
    nodeName: string
    etfCount: number
    indexCount: number
    success: boolean
    etfs?: ETFMatch[]
    indices?: IndexMatch[]
  }
}

export function SegmentCard({ segment, onCompanyClick, initialMatchResult }: SegmentCardProps) {
  const [isExpanded, setIsExpanded] = useState(false)
  const [matchedETFs, setMatchedETFs] = useState<ETFMatch[]>(initialMatchResult?.etfs || [])
  const [matchedIndices, setMatchedIndices] = useState<IndexMatch[]>(initialMatchResult?.indices || [])
  const [showETFs, setShowETFs] = useState(false)
  const [showIndices, setShowIndices] = useState(false)
  const hasCompanies = segment.companies.length > 0

  // 当接收到新的匹配结果时更新状态
  useEffect(() => {
    if (initialMatchResult?.etfs) {
      setMatchedETFs(initialMatchResult.etfs)
      if (initialMatchResult.etfs.length > 0) {
        setShowETFs(true)
      }
    }
    if (initialMatchResult?.indices) {
      setMatchedIndices(initialMatchResult.indices)
      if (initialMatchResult.indices.length > 0) {
        setShowIndices(true)
      }
    }
  }, [initialMatchResult])

  return (
    <Card className="bg-slate-50">
      <CardHeader className="pb-3">
        <div className="space-y-2">
          <div className="flex items-start justify-between">
            <CardTitle className="text-sm font-semibold text-slate-900">
              {segment.name}
            </CardTitle>
          </div>
          {segment.description && (
            <p className="text-xs text-muted-foreground">
              {segment.description}
            </p>
          )}
          {segment.keyCategories && segment.keyCategories.length > 0 && (
            <div className="flex flex-wrap gap-1">
              {segment.keyCategories.map((category, idx) => (
                <Badge key={`${segment.id}-category-${idx}`} variant="outline" className="text-xs">
                  {category}
                </Badge>
              ))}
            </div>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {/* ETF匹配结果 */}
        {matchedETFs.length > 0 && (
          <div className="space-y-3 pb-3 border-b">
            {/* ETF列表 */}
            <div>
              <button
                onClick={() => setShowETFs(!showETFs)}
                className="flex items-center justify-between w-full text-sm font-medium hover:text-primary transition-colors"
              >
                <div className="flex items-center gap-2">
                  <TrendingUp className="h-4 w-4 text-primary" />
                  <span>关联ETF ({matchedETFs.length})</span>
                </div>
                {showETFs ? (
                  <ChevronDown className="h-4 w-4" />
                ) : (
                  <ChevronRight className="h-4 w-4" />
                )}
              </button>

              {showETFs && (
                <div className="mt-2 space-y-2">
                  {matchedETFs.map((etf) => (
                    <div
                      key={etf.code}
                      className="flex items-start justify-between p-2 rounded-lg bg-white border hover:border-primary/50 transition-colors"
                    >
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <Badge variant="secondary" className="font-mono text-xs">
                            {etf.code}
                          </Badge>
                          <span className="text-sm font-medium truncate">
                            {etf.name}
                          </span>
                        </div>
                        {etf.reasoning && (
                          <p className="text-xs text-muted-foreground mt-1">
                            {etf.reasoning}
                          </p>
                        )}
                      </div>
                      <Badge variant="outline" className="ml-2 text-xs shrink-0">
                        {(etf.relevance * 100).toFixed(0)}%
                      </Badge>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {hasCompanies ? (
          <>
            {/* 企业数量摘要 - 可点击展开/收起 */}
            <Button
              variant="outline"
              size="sm"
              className="w-full justify-between"
              onClick={() => setIsExpanded(!isExpanded)}
            >
              <div className="flex items-center gap-2">
                <Building2 className="h-4 w-4 text-blue-600" />
                <span className="text-sm">
                  {segment.companies.length} 家企业
                </span>
              </div>
              {isExpanded ? (
                <ChevronDown className="h-4 w-4" />
              ) : (
                <ChevronRight className="h-4 w-4" />
              )}
            </Button>

            {/* 企业列表 - 折叠展示 */}
            {isExpanded && (
              <div className="space-y-2 pt-2 animate-in fade-in-50 duration-200">
                {segment.companies.map((company, idx) => (
                  <CompanyCard
                    key={`${segment.id}-${company.id}-${idx}`}
                    company={company}
                    onClick={() => onCompanyClick?.(company.id)}
                  />
                ))}

                {/* 原有的 ETF/指数显示（从数据库读取） */}
                <NodeETFIndexDisplay
                  nodeId={segment.id}
                  nodeName={segment.name}
                />
              </div>
            )}
          </>
        ) : (
          <div className="text-center text-sm text-muted-foreground py-4">
            暂无企业数据
          </div>
        )}
      </CardContent>
    </Card>
  )
}
