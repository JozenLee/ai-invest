import { NextRequest, NextResponse } from 'next/server'

/**
 * GET /api/datasources/schedulers/jobs
 * 获取所有调度任务列表
 *
 * Query参数:
 * - status: 任务状态过滤 (active/inactive/all)
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const status = searchParams.get('status') || 'all'

    const pythonServiceUrl = process.env.PYTHON_SERVICE_URL || 'http://localhost:8000'
    const jobsUrl = `${pythonServiceUrl}/schedulers/jobs?status=${status}`

    const response = await fetch(jobsUrl, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json'
      },
      signal: AbortSignal.timeout(5000)
    })

    if (!response.ok) {
      return NextResponse.json(
        {
          success: false,
          error: '获取调度任务列表失败',
          message: `Python服务返回状态码: ${response.status}`
        },
        { status: response.status }
      )
    }

    const data = await response.json()

    // 标准化返回格式
    return NextResponse.json({
      success: true,
      jobs: data.jobs || data.data || [],
      total: data.total || (data.jobs || data.data || []).length
    })

  } catch (error) {
    console.error('获取调度任务列表失败:', error)

    let errorMessage = '未知错误'
    if (error instanceof Error) {
      if (error.name === 'AbortError') {
        errorMessage = 'Python服务请求超时'
      } else if (error.message.includes('ECONNREFUSED')) {
        errorMessage = 'Python服务未启动或无法连接'
      } else {
        errorMessage = error.message
      }
    }

    // 返回空任务列表而不是503错误
    return NextResponse.json({
      success: true,
      jobs: [],
      total: 0,
      message: `调度任务服务不可用: ${errorMessage}`
    })
  }
}
