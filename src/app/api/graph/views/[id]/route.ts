import { NextResponse } from 'next/server'
import { GraphViewService } from '@/lib/services/graph-view.service'

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const view = GraphViewService.getViewById(id)

    if (!view) {
      return NextResponse.json(
        { success: false, error: '视角不存在' },
        { status: 404 }
      )
    }

    return NextResponse.json({
      success: true,
      data: view
    })
  } catch (error) {
    console.error('获取视角失败:', error)
    return NextResponse.json(
      { success: false, error: '获取视角失败' },
      { status: 500 }
    )
  }
}
