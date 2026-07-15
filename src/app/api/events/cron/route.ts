import { NextRequest, NextResponse } from 'next/server'
import { eventService } from '@/lib/services/event.service'

const DATA_SERVICE_URL = process.env.DATA_SERVICE_URL || 'http://localhost:8000'

// GET /api/events/cron — 定时采集新闻
// 可通过外部cron服务（如Vercel Cron、GitHub Actions）或系统crontab调用
export async function GET(request: NextRequest) {
  // 简单的密钥验证（防止滥用）
  const authKey = request.headers.get('x-cron-key') || request.nextUrl.searchParams.get('key')
  const expectedKey = process.env.CRON_SECRET_KEY || 'ai-invest-cron-2024'

  if (authKey !== expectedKey) {
    return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 })
  }

  try {
    // 1. 从Python数据服务获取最新新闻
    const response = await fetch(`${DATA_SERVICE_URL}/api/news/feed?limit=50`, {
      signal: AbortSignal.timeout(30000),
    })

    if (!response.ok) {
      throw new Error(`Python数据服务响应异常: ${response.status}`)
    }

    const data = await response.json()
    if (!data.success || !data.data?.items) {
      return NextResponse.json({
        success: false,
        error: '无法获取新闻数据',
      })
    }

    // 2. 保存到本地数据库（滚动刷新）
    const articles = data.data.items.map((item: Record<string, unknown>) => ({
      id: item.id as string,
      title: item.title as string,
      content: (item.content as string) || '',
      summary: item.summary as string | undefined,
      source: (item.source as string) || '财联社',
      url: item.url as string | undefined,
      publishTime: item.publishTime as string,
      category: (item.category as string) || 'market',
      sentiment: item.sentiment as number | undefined,
      impact: item.impact as number | undefined,
      entities: item.entities,
      sectors: item.sectors as string[] | undefined,
    }))

    const result = await eventService.saveNewsWithRollingRefresh(articles, 7)

    return NextResponse.json({
      success: true,
      data: {
        fetched: articles.length,
        saved: result.saved,
        deleted: result.deleted,
        timestamp: new Date().toISOString(),
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
