import { NextRequest, NextResponse } from 'next/server'
import { eventService } from '@/lib/services/event.service'

/**
 * GET /api/logs/fetch
 * 获取采集日志列表
 *
 * Query参数:
 * - sourceId: 数据源ID过滤
 * - status: 状态过滤 (success/failed/running)
 * - limit: 每页数量
 * - offset: 偏移量
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)

    const params = {
      sourceId: searchParams.get('sourceId') || undefined,
      status: searchParams.get('status') || undefined,
      limit: parseInt(searchParams.get('limit') || '50'),
      offset: parseInt(searchParams.get('offset') || '0')
    }

    const result = await eventService.getFetchLogs(params)

    return NextResponse.json({
      success: true,
      data: result.items,
      total: result.total,
      limit: params.limit,
      offset: params.offset
    })
  } catch (error) {
    console.error('获取采集日志失败:', error)
    return NextResponse.json(
      {
        success: false,
        error: '获取采集日志失败',
        message: error instanceof Error ? error.message : '未知错误'
      },
      { status: 500 }
    )
  }
}
