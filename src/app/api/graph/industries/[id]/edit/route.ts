// src/app/api/graph/industries/[id]/edit/route.ts
import { NextRequest, NextResponse } from 'next/server'

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params

    // 调用Python数据服务创建编辑任务
    const dataServiceUrl = process.env.DATA_SERVICE_URL || 'http://localhost:8000'
    const response = await fetch(
      `${dataServiceUrl}/api/v1/industry-graph/edit/${id}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      }
    )

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}))
      throw new Error(errorData.detail || '创建编辑任务失败')
    }

    const data = await response.json()

    return NextResponse.json({
      success: true,
      message: data.message,
      data: {
        taskId: data.task_id,
        industryId: data.industry_id,
        status: data.status
      }
    })
  } catch (error) {
    console.error('创建编辑任务失败:', error)
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : '创建编辑任务失败'
      },
      { status: 500 }
    )
  }
}
