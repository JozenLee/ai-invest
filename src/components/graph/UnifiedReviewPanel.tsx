'use client'

import { useState } from 'react'
import { Check, RefreshCw, ChevronDown, ChevronUp } from 'lucide-react'
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
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
          <p className="text-sm text-blue-900 dark:text-blue-100">
            💡 您可以在下方输入框中提出修改意见，AI将同时优化产业结构和企业信息。
            例如：补充某个环节、调整阶段划分、增加龙头企业等。
          </p>
        </div>

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
