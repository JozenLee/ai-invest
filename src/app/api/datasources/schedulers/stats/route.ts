import { NextResponse } from 'next/server'

/**
 * GET /api/datasources/schedulers/stats
 * 获取调度器统计信息
 */
export async function GET() {
  try {
    const pythonServiceUrl = process.env.PYTHON_SERVICE_URL || 'http://localhost:8000'
    const statsUrl = `${pythonServiceUrl}/schedulers/stats`

    const response = await fetch(statsUrl, {
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
          error: '获取调度统计失败',
          message: `Python服务返回状态码: ${response.status}`
        },
        { status: response.status }
      )
    }

    const data = await response.json()

    return NextResponse.json({
      success: true,
      totalExecutions: data.totalExecutions || data.total || 0,
      successRate: data.successRate || 0,
      averageDuration: data.averageDuration || data.avgDuration || 0,
      failedCount: data.failedCount || 0,
      lastExecution: data.lastExecution || null,
      ...data
    })

  } catch (error) {
    console.error('获取调度统计失败:', error)

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

    // 返回默认统计数据而不是503错误
    return NextResponse.json({
      success: true,
      totalExecutions: 0,
      successRate: 0,
      averageDuration: 0,
      failedCount: 0,
      lastExecution: null,
      message: `调度统计服务不可用: ${errorMessage}`
    })
  }
}
