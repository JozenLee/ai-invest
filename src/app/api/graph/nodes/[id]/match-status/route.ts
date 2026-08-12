// API路由：获取节点的匹配状态
// GET /api/graph/nodes/[id]/match-status

import { NextRequest, NextResponse } from 'next/server'
import { etfIndexMatcher } from '@/lib/services/etf-index-matcher.service'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params

    const status = await etfIndexMatcher.getMatchStatus(id)

    return NextResponse.json({
      success: true,
      data: status,
    })
  } catch (error) {
    console.error('获取节点匹配状态失败:', error)
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : '获取失败',
      },
      { status: 500 }
    )
  }
}
