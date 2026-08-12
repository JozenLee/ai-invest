'use client'

import { useState } from 'react'
import { Check, RefreshCw } from 'lucide-react'
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
import { CoverageAssessment, getDimensionLabel } from '@/types/coverage'
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
    }>
  }>
}

interface StructureReviewPanelProps {
  structure: IndustryStructure
  coverage: CoverageAssessment
  isSubmitting: boolean
  onApprove: (feedback: ReviewFeedback) => void
  onReject: (feedback: ReviewFeedback) => void
}

export function StructureReviewPanel({
  structure,
  coverage,
  isSubmitting,
  onApprove,
  onReject
}: StructureReviewPanelProps) {
  const [comments, setComments] = useState('')

  return (
    <Card>
      <CardHeader>
        <CardTitle>产业链结构审核</CardTitle>
        <CardDescription>
          请审核AI生成的产业链骨架，可以添加评论要求改进
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-6">
        {/* 简要说明 */}
        <div className="bg-muted/50 p-4 rounded-lg">
          <p className="text-sm text-muted-foreground">
            请查看右侧的泳道图预览，确认产业链结构是否完整准确。
          </p>
        </div>

        {/* 评论输入 */}
        <div className="space-y-2">
          <Label htmlFor="comments">反馈意见（可选）</Label>
          <Textarea
            id="comments"
            placeholder="如有需要改进的地方，请在此说明。例如：补充下游应用场景、增加国际龙头企业等"
            value={comments}
            onChange={(e) => setComments(e.target.value)}
            rows={4}
          />
        </div>
      </CardContent>

      <CardFooter className="flex justify-end gap-2">
        <Button
          variant="outline"
          onClick={() => onReject({ approved: false, comments })}
          disabled={isSubmitting || !comments.trim()}
        >
          <RefreshCw className="mr-2 h-4 w-4" />
          提交修改意见
        </Button>
        <Button
          onClick={() => onApprove({ approved: true, comments })}
          disabled={isSubmitting}
        >
          <Check className="mr-2 h-4 w-4" />
          确认完成
        </Button>
      </CardFooter>
    </Card>
  )
}
