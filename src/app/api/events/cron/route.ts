import { NextRequest, NextResponse } from 'next/server'

const DATA_SERVICE_URL = process.env.DATA_SERVICE_URL || 'http://localhost:8000'

// GET /api/events/cron — 定时采集新闻（触发器）
// 可通过外部cron服务（如Vercel Cron、GitHub Actions）或系统crontab调用
export async function GET(request: NextRequest) {
  // 简单的密钥验证（防止滥用）
  const authKey = request.headers.get('x-cron-key') || request.nextUrl.searchParams.get('key')
  const expectedKey = process.env.CRON_SECRET_KEY || 'ai-invest-cron-2024'

  if (authKey !== expectedKey) {
    return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 })
  }

  try {
    // 调用Python服务的refresh端点
    const response = await fetch(`${DATA_SERVICE_URL}/api/news/refresh?platform_id=cls-hot&limit=50`, {
      method: 'POST',
      signal: AbortSignal.timeout(120000), // 2分钟超时
    })

    if (!response.ok) {
      throw new Error(`Python服务响应异常: ${response.status}`)
    }

    const data = await response.json()

    if (!data.success) {
      return NextResponse.json({
        success: false,
        error: data.error || '采集失败',
      })
    }

    return NextResponse.json({
      success: true,
      data: {
        fetched: data.data.fetched,
        analyzed: data.data.analyzed,
        saved: data.data.saved,
        failed: data.data.failed,
        timestamp: data.data.timestamp,
      },
    })
  } catch (error) {
    console.error('定时新闻采集失败:', error)
    return NextResponse.json({
      success: false,
      error: `采集失败: ${error instanceof Error ? error.message : '未知错误'}`,
    })
  }
}
