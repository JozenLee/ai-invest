import { NextRequest, NextResponse } from 'next/server'
import { graphStateUpdaterService } from '@/lib/services/graph-state-updater.service'

/**
 * POST /api/graph/update-state
 * 手动触发图谱状态更新
 *
 * Body: {
 *   nodeIds?: string[] // 指定节点ID列表，不传则更新所有节点
 * }
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { nodeIds } = body

    let result

    if (nodeIds && Array.isArray(nodeIds)) {
      // 更新指定节点
      const updates = await graphStateUpdaterService.updateNodes(nodeIds)

      result = {
        total: nodeIds.length,
        updated: updates.length,
        failed: nodeIds.length - updates.length,
        updates
      }
    } else {
      // 更新所有节点
      result = await graphStateUpdaterService.updateAllNodeStates()
    }

    return NextResponse.json({
      success: true,
      data: result
    })
  } catch (error) {
    console.error('Update graph state error:', error)
    return NextResponse.json(
      { success: false, error: String(error) },
      { status: 500 }
    )
  }
}
