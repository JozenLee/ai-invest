'use client'

import { useState } from 'react'
import { Check, RefreshCw, CircleHelp, ArrowRight } from 'lucide-react'
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { ReviewFeedback } from '@/types/review'

interface IndustryStructure {
  industry: {
    name: string
    description?: string
  }
  structure: Array<{
    stage: string
    stage_code: string
    description?: string
    segments: Array<{
      name: string
      code: string
      description?: string
      companies?: Array<{
        name: string
        ticker?: string
        description?: string
      }>
    }>
  }>
  relationships?: Array<{
    from?: string
    to?: string
    from_segment?: string
    to_segment?: string
    type: string
    direction?: string
    confidence?: number
    description?: string
    evidence_urls?: string[]
  }>
}

interface Company {
  name: string
  ticker?: string
  description?: string
}

interface SegmentDetail {
  companies: Company[]
  relationships?: any[]
}

interface ExplorationResult {
  structure: IndustryStructure
  details: Record<string, SegmentDetail>
}

interface UnifiedReviewPanelProps {
  structure: IndustryStructure
  result?: ExplorationResult
  isSubmitting: boolean
  onApprove: (feedback: ReviewFeedback) => void
  onReject: (feedback: ReviewFeedback) => void
}

export function UnifiedReviewPanel({
  structure,
  result,
  isSubmitting,
  onApprove,
  onReject
}: UnifiedReviewPanelProps) {
  const [comments, setComments] = useState('')

  const handleReject = () => {
    console.log('[UnifiedReviewPanel] 点击提交修改意见', {
      approved: false,
      comments,
      commentsLength: comments.length,
      commentsTrimmed: comments.trim()
    })
    onReject({ approved: false, comments })
  }

  const handleApprove = () => {
    console.log('[UnifiedReviewPanel] 点击确认完成', {
      approved: true,
      comments
    })
    onApprove({ approved: true, comments })
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>知识图谱审核与编辑</CardTitle>
        <CardDescription>
          请审核右侧泳道图中的产业链结构和企业信息，可以提出修改意见进行增量优化
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-6">
        {/* 简要说明 */}
        <div className="bg-blue-50 dark:bg-blue-950 p-4 rounded-lg border border-blue-200 dark:border-blue-800">
          <div className="flex items-start gap-2 text-sm text-blue-900 dark:text-blue-100">
            <CircleHelp className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
            <p>您可以在下方输入框中提出修改意见，AI将同时优化产业结构、企业信息和传导关系。例如：补充某个环节、调整阶段划分、增加龙头企业或修正上下游关系。</p>
          </div>
        </div>

        <section aria-labelledby="graph-relations-heading" className="space-y-3">
          <div className="flex items-center justify-between gap-3">
            <h3 id="graph-relations-heading" className="text-sm font-medium">环节传导关系</h3>
            <span className="text-sm tabular-nums text-muted-foreground">{structure.relationships?.length || 0} 条</span>
          </div>
          {structure.relationships?.length ? (
            <ul className="grid gap-2 sm:grid-cols-2">
              {structure.relationships.slice(0, 12).map((relationship, index) => (
                <li key={`${relationship.from || relationship.from_segment}-${relationship.type}-${relationship.to || relationship.to_segment}-${index}`} className="rounded-md border bg-muted/30 p-3 text-sm">
                  <div className="flex items-center gap-2 font-medium">
                    <span>{relationship.from || relationship.from_segment}</span>
                    <ArrowRight className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                    <span>{relationship.to || relationship.to_segment}</span>
                  </div>
                  <p className="mt-1 text-xs leading-5 text-muted-foreground">{relationship.type} · {relationship.direction || '方向待核验'} · 置信度 {Math.round((relationship.confidence || 0) * 100)}%{relationship.evidence_urls?.length ? ` · ${relationship.evidence_urls.length} 条来源` : ' · 暂无来源'}</p>
                </li>
              ))}
            </ul>
          ) : <p className="rounded-md border border-dashed p-3 text-sm text-muted-foreground">尚未生成可审核的环节传导关系。图谱仍可用于分类，但不会参与事件传播。</p>}
        </section>

        {/* 反馈输入 */}
        <div className="space-y-2">
          <Label htmlFor="comments">修改意见（可选）</Label>
          <Textarea
            id="comments"
            placeholder="请描述需要修改的内容，例如：
- 在上游增加原材料供应环节
- 补充芯片设计环节的国内龙头企业
- 调整中游阶段的环节划分
- 增加下游的新兴应用场景"
            value={comments}
            onChange={(e) => setComments(e.target.value)}
            rows={6}
          />
          <p className="text-xs text-muted-foreground">
            AI将根据您的意见增量修改，保留未提及的内容
          </p>
        </div>
      </CardContent>

      <CardFooter className="flex justify-end gap-2">
        <Button
          variant="outline"
          onClick={handleReject}
          disabled={isSubmitting || !comments.trim()}
        >
          <RefreshCw className="mr-2 h-4 w-4" />
          提交修改意见
        </Button>
        <Button
          onClick={handleApprove}
          disabled={isSubmitting}
        >
          <Check className="mr-2 h-4 w-4" />
          确认完成
        </Button>
      </CardFooter>
    </Card>
  )
}
