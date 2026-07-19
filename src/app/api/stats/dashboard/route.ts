import { NextResponse } from 'next/server'
import { eventService } from '@/lib/services/event.service'

/**
 * GET /api/stats/dashboard
 * 获取仪表盘综合统计数据
 */
export async function GET() {
  try {
    const stats = await eventService.getDashboardStats()

    return NextResponse.json({
      success: true,
      data: stats
    })
  } catch (error) {
    console.error('获取统计数据失败:', error)
    return NextResponse.json(
      {
        success: false,
        error: '获取统计数据失败',
        message: error instanceof Error ? error.message : '未知错误'
      },
      { status: 500 }
    )
  }
}
