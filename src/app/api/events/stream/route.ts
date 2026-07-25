import { NextRequest, NextResponse } from 'next/server'

const DATA_SERVICE_URL = process.env.DATA_SERVICE_URL || 'http://localhost:8000'

export async function GET(request: NextRequest) {
  try {
    // 连接到Python SSE流
    const response = await fetch(`${DATA_SERVICE_URL}/api/news/stream`, {
      headers: {
        'Accept': 'text/event-stream',
      },
    })

    if (!response.ok || !response.body) {
      throw new Error('Failed to connect to SSE stream')
    }

    // 代理流到前端
    return new Response(response.body, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
        'X-Accel-Buffering': 'no', // 禁用nginx缓冲
      },
    })
  } catch (error) {
    console.error('SSE stream error:', error)
    return new Response('SSE stream unavailable', { status: 503 })
  }
}
