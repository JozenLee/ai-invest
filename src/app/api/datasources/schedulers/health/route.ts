import { NextResponse } from 'next/server'

/**
 * GET /api/datasources/schedulers/health
 * 获取调度器健康状态
 *
 * 调用 Python 数据服务的健康检查端点
 */
export async function GET() {
  try {
    const pythonServiceUrl = process.env.PYTHON_SERVICE_URL || 'http://localhost:8000'
    const healthUrl = `${pythonServiceUrl}/schedulers/health`

    const response = await fetch(healthUrl, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json'
      },
      // 设置超时
      signal: AbortSignal.timeout(5000)
    })

    if (!response.ok) {
      return NextResponse.json(
        {
          success: false,
          error: '调度器健康检查失败',
          message: `Python服务返回状态码: ${response.status}`
        },
        { status: response.status }
      )
    }

    const data = await response.json()

    return NextResponse.json({
      success: true,
      data
    })

  } catch (error) {
    console.error('调度器健康检查失败:', error)

    // 区分不同类型的错误
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

    return NextResponse.json(
      {
        success: false,
        error: '调度器健康检查失败',
        message: errorMessage
      },
      { status: 503 }
    )
  }
}
