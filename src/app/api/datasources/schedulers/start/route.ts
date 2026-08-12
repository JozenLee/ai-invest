import { NextResponse } from 'next/server'

/**
 * POST /api/datasources/schedulers/start
 * 启动调度器
 */
export async function POST() {
  try {
    const pythonServiceUrl = process.env.PYTHON_SERVICE_URL || 'http://localhost:8000'
    const startUrl = `${pythonServiceUrl}/schedulers/start`

    const response = await fetch(startUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      signal: AbortSignal.timeout(5000)
    })

    if (!response.ok) {
      // 409表示调度器已经运行中
      if (response.status === 409) {
        const data = await response.json().catch(() => ({}))
        return NextResponse.json(
          {
            success: true,
            status: 'already_running',
            message: '调度器已在运行中',
            ...data
          },
          { status: 409 }
        )
      }

      return NextResponse.json(
        {
          success: false,
          error: '启动调度器失败',
          message: `Python服务返回状态码: ${response.status}`
        },
        { status: response.status }
      )
    }

    const data = await response.json()

    return NextResponse.json({
      success: true,
      status: 'started',
      message: '调度器启动成功',
      data
    })

  } catch (error) {
    console.error('启动调度器失败:', error)

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
        error: '启动调度器失败',
        message: errorMessage
      },
      { status: 503 }
    )
  }
}
