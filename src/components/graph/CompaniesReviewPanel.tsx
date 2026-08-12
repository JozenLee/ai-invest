'use client'

import { useState } from 'react'
import { Check, RefreshCw, Building2 } from 'lucide-react'
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { CoverageAssessment } from '@/types/coverage'
import { ReviewFeedback } from '@/types/review'

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
  structure: {
    industry: {
      name: string
      description?: string
    }
    structure: Array<{
      stage: string
      stage_code: string
      segments: Array<{
        name: string
        code: string
      }>
    }>
  }
  details: Record<string, SegmentDetail>
}

interface CompaniesReviewPanelProps {
  result: ExplorationResult
  coverage: CoverageAssessment
  isSubmitting: boolean
  onApprove: (feedback: ReviewFeedback) => void
  onReject: (feedback: ReviewFeedback) => void
}

export function CompaniesReviewPanel({
  result,
  coverage,
  isSubmitting,
  onApprove,
  onReject
}: CompaniesReviewPanelProps) {
  const [comments, setComments] = useState('')

  return (
    <Card>
      <CardHeader>
        <CardTitle>企业信息审核</CardTitle>
        <CardDescription>
          请审核AI填充的企业信息，可以要求补充遗漏的企业
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-6">
        {/* 简要说明 */}
        <div className="bg-muted/50 p-4 rounded-lg">
          <p className="text-sm text-muted-foreground">
            请查看右侧的泳道图预览，确认企业信息是否完整准确。
          </p>
        </div>

        {/* 评论输入 */}
        <div className="space-y-2">
          <Label htmlFor="comments">补充说明（可选）</Label>
          <Textarea
            id="comments"
            placeholder="如需补充企业信息，请说明。例如：补充某环节的国内龙头企业、增加某领域的新兴公司等"
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
