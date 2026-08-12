// src/app/api/graph/industries/tasks/[taskId]/route.ts
import { NextRequest, NextResponse } from 'next/server'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ taskId: string }> }
) {
  const { taskId } = await params
  try {
    console.log('[查询任务状态] taskId:', taskId)

    // 调用Python数据服务
    const dataServiceUrl = process.env.DATA_SERVICE_URL || 'http://localhost:8000'
    const url = `${dataServiceUrl}/api/v1/industry-graph/tasks/${taskId}`
    console.log('[查询任务状态] 请求URL:', url)

    const response = await fetch(url)
    console.log('[查询任务状态] 响应状态:', response.status)
    console.log('[查询任务状态] 响应头:', Object.fromEntries(response.headers.entries()))

    if (!response.ok) {
      const errorText = await response.text()
      console.error('[查询任务状态] 错误响应:', errorText)
      console.error('[查询任务状态] URL:', url)
      console.error('[查询任务状态] 状态码:', response.status)
      throw new Error(`数据服务返回错误 (${response.status}): ${errorText}`)
    }

    const data = await response.json()
    console.log('[查询任务状态] 响应数据 (taskId/status/progress):', {
      task_id: data.task_id,
      status: data.status,
      progress: data.progress
    })

    return NextResponse.json({
      success: true,
      data: {
        taskId: data.task_id,
        industryId: data.industry_id,
        industryName: data.industry_name || '',
        status: data.status,
        progress: data.progress,
        currentStep: data.current_step,
        structureYaml: data.structure,
        structure: data.structure,
        result: data.result,
        coverage_assessment: data.coverage_assessment,
        exploration_context: data.exploration_context,
        structure_iterations: data.structure_iterations || 0,
        companies_iterations: data.companies_iterations || 0,
        review_history: data.review_history || [],
        graph_stats: data.graph_stats,
        error: data.error
      }
    })
  } catch (error) {
    console.error('[查询任务状态] 异常:', error)
    console.error('[查询任务状态] 错误堆栈:', error instanceof Error ? error.stack : 'N/A')

    // 检查是否是超时错误
    if (error instanceof Error && error.name === 'TimeoutError') {
      console.error('[查询任务状态] 超时: taskId=' + taskId)
      return NextResponse.json(
        {
          success: false,
          error: '请求超时：数据服务响应时间过长',
          details: {
            taskId,
            errorType: 'timeout'
          }
        },
        { status: 504 }
      )
    }

    // 检查是否是网络错误
    if (error instanceof TypeError && error.message.includes('fetch')) {
      console.error('[查询任务状态] 网络错误: 无法连接到数据服务')
      return NextResponse.json(
        {
          success: false,
          error: '无法连接到数据服务，请检查数据服务是否启动',
          details: {
            taskId,
            errorType: 'network',
            message: error.message
          }
        },
        { status: 503 }
      )
    }

    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : '获取任务状态失败',
        details: {
          taskId,
          errorType: 'unknown',
          message: error instanceof Error ? error.message : String(error)
        }
      },
      { status: 500 }
    )
  }
}
