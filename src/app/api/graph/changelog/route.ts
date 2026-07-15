import { NextRequest, NextResponse } from 'next/server'
import { graphService } from '@/lib/services/graph.service'

// GET /api/graph/changelog - 获取变更日志
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const limit = parseInt(searchParams.get('limit') || '50')

    const logs = await graphService.getChangelog(limit)

    return NextResponse.json({
      success: true,
      data: logs
    })
  } catch (error) {
    console.error('获取变更日志失败:', error)
    return NextResponse.json({
      success: false,
      error: '无法获取变更日志',
      data: null,
    })
  }
}
