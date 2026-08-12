import { NextResponse } from 'next/server'

/**
 * POST /api/datasources/schedulers/pause
 * 暂停调度器
 */
export async function POST() {
  try {
    const pythonServiceUrl = process.env.PYTHON_SERVICE_URL || 'http://localhost:8000'
    const pauseUrl = `${pythonServiceUrl}/schedulers/pause`

    const response = await fetch(pauseUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      signal: AbortSignal.timeout(5000)
    })

    // 501表示功能未实现
    if (response.status === 501) {
      return NextResponse.json(
        {
          success: false,
          error: '暂停功能未实现',
          message: 'Python服务尚未实现暂停功能'
        },
        { status: 501 }
      )
    }

    if (!response.ok) {
      return NextResponse.json(
        {
          success: false,
          error: '暂停调度器失败',
          message: `Python服务返回状态码: ${response.status}`
        },
        { status: response.status }
      )
    }

    const data = await response.json()

    return NextResponse.json({
      success: true,
      status: 'paused',
      message: '调度器已暂停',
      data
    })

  } catch (error) {
    console.error('暂停调度器失败:', error)

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
        error: '暂停调度器失败',
        message: errorMessage
      },
      { status: 503 }
    )
  }
}
