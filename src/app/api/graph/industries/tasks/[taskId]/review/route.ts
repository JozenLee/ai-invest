// src/app/api/graph/industries/tasks/[taskId]/review/route.ts
import { NextRequest, NextResponse } from 'next/server'

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ taskId: string }> }
) {
  try {
    const { taskId } = await params
    const body = await request.json()

    // 调用Python数据服务的统一审核端点
    const dataServiceUrl = process.env.DATA_SERVICE_URL || 'http://localhost:8000'
    const response = await fetch(
      `${dataServiceUrl}/api/v1/industry-graph/tasks/${taskId}/review`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      }
    )

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}))
      throw new Error(errorData.detail || '提交统一审核失败')
    }

    const data = await response.json()

    return NextResponse.json({
      success: true,
      message: data.message,
      data: {
        newStatus: data.new_status
      }
    })
  } catch (error) {
    console.error('提交统一审核失败:', error)
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : '提交统一审核失败'
      },
      { status: 500 }
    )
  }
}
