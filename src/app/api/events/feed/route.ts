import { NextRequest, NextResponse } from 'next/server'
import { eventService } from '@/lib/services/event.service'

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const category = searchParams.get('category') || undefined
    const limit = parseInt(searchParams.get('limit') || '20')
    const offset = parseInt(searchParams.get('offset') || '0')

    const result = await eventService.getNewsFeed({ category, limit, offset })

    return NextResponse.json({
      success: true,
      data: result
    })
  } catch (error) {
    console.error('获取新闻失败:', error)
    return NextResponse.json({
      success: false,
      error: '无法获取新闻数据，请确认数据服务已启动',
      data: null,
    })
  }
}
