import { NextResponse } from 'next/server'

/**
 * POST /api/datasources/schedulers/stop
 * 停止调度器
 */
export async function POST() {
  try {
    const pythonServiceUrl = process.env.PYTHON_SERVICE_URL || 'http://localhost:8000'
    const stopUrl = `${pythonServiceUrl}/schedulers/stop`

    const response = await fetch(stopUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      signal: AbortSignal.timeout(5000)
    })

    if (!response.ok) {
      return NextResponse.json(
        {
          success: false,
          error: '停止调度器失败',
          message: `Python服务返回状态码: ${response.status}`
        },
        { status: response.status }
      )
    }

    const data = await response.json()

    return NextResponse.json({
      success: true,
      status: 'stopped',
      message: '调度器已停止',
      data
    })

  } catch (error) {
    console.error('停止调度器失败:', error)

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
        error: '停止调度器失败',
        message: errorMessage
      },
      { status: 503 }
    )
  }
}
