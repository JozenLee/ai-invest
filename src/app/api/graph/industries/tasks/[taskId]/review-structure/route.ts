// src/app/api/graph/industries/tasks/[taskId]/review-structure/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'

const reviewSchema = z.object({
  approved: z.boolean(),
  comments: z.string().optional(),
  modified_structure: z.any().optional()
})

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ taskId: string }> }
) {
  try {
    const { taskId } = await params
    const body = await request.json()
    const { approved, comments, modified_structure } = reviewSchema.parse(body)

    // 调用Python数据服务
    const dataServiceUrl = process.env.DATA_SERVICE_URL || 'http://localhost:8000'
    const response = await fetch(
      `${dataServiceUrl}/api/v1/industry-graph/tasks/${taskId}/review-structure`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ approved, comments, modified_structure })
      }
    )

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}))
      throw new Error(errorData.detail || '提交结构审核失败')
    }

    const data = await response.json()

    return NextResponse.json({
      success: true,
      message: data.message,
      data: data
    })
  } catch (error) {
    console.error('提交结构审核失败:', error)
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : '提交结构审核失败'
      },
      { status: 500 }
    )
  }
}
