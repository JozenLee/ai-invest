// src/components/graph/SuggestionDetail.tsx
'use client'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Separator } from '@/components/ui/separator'
import { CheckCircle2, XCircle, AlertTriangle, FileText } from 'lucide-react'

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

interface SuggestionDetailProps {
  suggestion: GraphSuggestion | null
  onApprove?: (id: string) => void
  onReject?: (id: string) => void
}

export function SuggestionDetail({
  suggestion,
  onApprove,
  onReject
}: SuggestionDetailProps) {
  if (!suggestion) {
    return (
      <Card>
        <CardContent className="flex h-96 items-center justify-center text-muted-foreground">
          <div className="text-center">
            <FileText className="mx-auto h-12 w-12 mb-4 opacity-50" />
            <p>选择一个建议查看详情</p>
          </div>
        </CardContent>
      </Card>
    )
  }

  const data = JSON.parse(suggestion.data)
  const evidence = suggestion.evidence ? JSON.parse(suggestion.evidence) : []

  // Get confidence level
  const getConfidenceLevel = (confidence: number) => {
    if (confidence >= 0.9) return { label: '很高', color: 'text-green-600', icon: CheckCircle2 }
    if (confidence >= 0.7) return { label: '高', color: 'text-blue-600', icon: CheckCircle2 }
    if (confidence >= 0.5) return { label: '中等', color: 'text-yellow-600', icon: AlertTriangle }
    return { label: '低', color: 'text-red-600', icon: XCircle }
  }

  const confidenceLevel = getConfidenceLevel(suggestion.confidence)
  const ConfidenceIcon = confidenceLevel.icon

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center justify-between">
          <span>建议详情</span>
          {suggestion.status === 'pending' && (
            <div className="flex gap-2">
              <Button
                size="sm"
                variant="default"
                onClick={() => onApprove?.(suggestion.id)}
              >
                <CheckCircle2 className="h-4 w-4 mr-1" />
                批准
              </Button>
              <Button
                size="sm"
                variant="destructive"
                onClick={() => onReject?.(suggestion.id)}
              >
                <XCircle className="h-4 w-4 mr-1" />
                拒绝
              </Button>
            </div>
          )}
        </CardTitle>
        <CardDescription>
          来源: {suggestion.source} • {new Date(suggestion.createdAt).toLocaleString('zh-CN')}
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-4">
        {/* Confidence */}
        <div>
          <h4 className="text-sm font-medium mb-2">置信度</h4>
          <div className="flex items-center gap-2">
            <ConfidenceIcon className={`h-5 w-5 ${confidenceLevel.color}`} />
            <span className={`text-lg font-semibold ${confidenceLevel.color}`}>
              {(suggestion.confidence * 100).toFixed(0)}%
            </span>
            <Badge variant="outline">{confidenceLevel.label}</Badge>
          </div>
        </div>

        <Separator />

        {/* Data content */}
        <div>
          <h4 className="text-sm font-medium mb-2">建议内容</h4>
          <div className="rounded-lg bg-muted p-4 space-y-2">
            {suggestion.type.includes('node') && (
              <>
                <div className="flex items-center gap-2">
                  <span className="text-sm text-muted-foreground">名称:</span>
                  <span className="font-medium">{data.name}</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-sm text-muted-foreground">类型:</span>
                  <Badge>{data.type}</Badge>
                </div>
                {data.description && (
                  <div>
                    <span className="text-sm text-muted-foreground">描述:</span>
                    <p className="mt-1">{data.description}</p>
                  </div>
                )}
                <div className="flex items-center gap-2">
                  <span className="text-sm text-muted-foreground">层级:</span>
                  <span>L{data.level}</span>
                </div>
              </>
            )}

            {suggestion.type.includes('edge') && (
              <>
                <div className="flex items-center gap-2">
                  <span className="text-sm text-muted-foreground">起点:</span>
                  <span className="font-medium">{data.source}</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-sm text-muted-foreground">终点:</span>
                  <span className="font-medium">{data.target}</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-sm text-muted-foreground">关系:</span>
                  <Badge>{data.relation}</Badge>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-sm text-muted-foreground">方向:</span>
                  <Badge variant={data.direction === 'positive' ? 'default' : 'destructive'}>
                    {data.direction === 'positive' ? '正向' : '负向'}
                  </Badge>
                </div>
                {data.weight !== undefined && (
                  <div className="flex items-center gap-2">
                    <span className="text-sm text-muted-foreground">权重:</span>
                    <span>{data.weight.toFixed(2)}</span>
                  </div>
                )}
                {data.lag && (
                  <div className="flex items-center gap-2">
                    <span className="text-sm text-muted-foreground">滞后期:</span>
                    <span>{data.lag}</span>
                  </div>
                )}
              </>
            )}
          </div>
        </div>

        <Separator />

        {/* Evidence */}
        {evidence.length > 0 && (
          <div>
            <h4 className="text-sm font-medium mb-2">支撑证据 ({evidence.length})</h4>
            <ScrollArea className="h-48 rounded-lg border p-4">
              <div className="space-y-3">
                {evidence.map((e: string, i: number) => (
                  <div key={i} className="text-sm">
                    <span className="font-medium text-muted-foreground">{i + 1}.</span>{' '}
                    <span className="italic">&ldquo;{e}&rdquo;</span>
                  </div>
                ))}
              </div>
            </ScrollArea>
          </div>
        )}

        {/* Preview (for graph visualization) */}
        {suggestion.type.includes('edge') && (
          <>
            <Separator />
            <div>
              <h4 className="text-sm font-medium mb-2">关系预览</h4>
              <div className="flex items-center justify-center gap-4 p-8 rounded-lg border bg-muted/30">
                <div className="rounded-full bg-primary/10 px-4 py-2 font-medium">
                  {data.source}
                </div>
                <div className="flex flex-col items-center">
                  <div className="text-xs text-muted-foreground mb-1">{data.relation}</div>
                  <div className="h-0.5 w-16 bg-primary" />
                  <div className="mt-1 text-xs">
                    {data.direction === 'positive' ? '→' : '⊣'}
                  </div>
                </div>
                <div className="rounded-full bg-primary/10 px-4 py-2 font-medium">
                  {data.target}
                </div>
              </div>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  )
}
