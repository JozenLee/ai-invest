import { NextResponse } from 'next/server'
import { GraphViewService } from '@/lib/services/graph-view.service'

export async function GET() {
  try {
    const views = GraphViewService.getViews()

    return NextResponse.json({
      success: true,
      data: views
    })
  } catch (error) {
    console.error('获取视角列表失败:', error)
    return NextResponse.json(
      { success: false, error: '获取视角列表失败' },
      { status: 500 }
    )
  }
}
