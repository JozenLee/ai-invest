// src/app/api/graph/industries/tasks/[taskId]/route.ts
import { NextRequest, NextResponse } from 'next/server'

export async function GET(
  request: NextRequest,
  { params }: { params: { taskId: string } }
) {
  try {
    const { taskId } = params

    // 调用Python数据服务
    const dataServiceUrl = process.env.DATA_SERVICE_URL || 'http://localhost:8000'
    const response = await fetch(`${dataServiceUrl}/api/v1/industry-graph/tasks/${taskId}`)

    if (!response.ok) {
      throw new Error('获取任务状态失败')
    }

    const data = await response.json()

    return NextResponse.json({
      success: true,
      data: {
        taskId: data.task_id,
        status: data.status,
        progress: data.progress,
        currentStep: data.current_step,
        structureYaml: data.structure,
        error: data.error
      }
    })
  } catch (error) {
    console.error('获取任务状态失败:', error)
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : '获取任务状态失败'
      },
      { status: 500 }
    )
  }
}
