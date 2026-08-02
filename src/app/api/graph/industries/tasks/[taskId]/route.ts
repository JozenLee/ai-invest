// src/app/api/graph/industries/tasks/[taskId]/route.ts
import { NextRequest, NextResponse } from 'next/server'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ taskId: string }> }
) {
  try {
    const { taskId } = await params
    console.log('[查询任务状态] taskId:', taskId)

    // 调用Python数据服务
    const dataServiceUrl = process.env.DATA_SERVICE_URL || 'http://localhost:8000'
    const url = `${dataServiceUrl}/api/v1/industry-graph/tasks/${taskId}`
    console.log('[查询任务状态] 请求URL:', url)

    const response = await fetch(url)
    console.log('[查询任务状态] 响应状态:', response.status)

    if (!response.ok) {
      const errorText = await response.text()
      console.error('[查询任务状态] 错误响应:', errorText)
      throw new Error(`获取任务状态失败: ${response.status}`)
    }

    const data = await response.json()
    console.log('[查询任务状态] 响应数据:', JSON.stringify(data, null, 2))

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
    console.error('[查询任务状态] 异常:', error)
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : '获取任务状态失败'
      },
      { status: 500 }
    )
  }
}
