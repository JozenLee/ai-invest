// API: 获取图谱节点的市场数据增强
import { NextRequest, NextResponse } from 'next/server'
import { graphService } from '@/lib/services/graph.service'
import { graphMarketDataService } from '@/lib/services/graph-market-data.service'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: nodeId } = await params

    // 获取节点基础数据
    const node = await graphService.getNode(nodeId)
    if (!node) {
      return NextResponse.json(
        { success: false, error: 'Node not found' },
        { status: 404 }
      )
    }

    // 增强市场数据
    const enhancedNode = await graphMarketDataService.enhanceNode(node)

    return NextResponse.json({
      success: true,
      data: enhancedNode
    })
  } catch (error) {
    console.error('获取节点市场数据失败:', error)
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : '获取市场数据失败'
      },
      { status: 500 }
    )
  }
}
