// API: 获取完整图谱数据（带市场数据增强）
import { NextRequest, NextResponse } from 'next/server'
import { graphService } from '@/lib/services/graph.service'
import { graphMarketDataService } from '@/lib/services/graph-market-data.service'

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams
    const enhance = searchParams.get('enhance') === 'true' // 是否增强市场数据
    const nodeType = searchParams.get('type') // 可选：按节点类型过滤

    // 获取基础图谱数据
    const { nodes, edges } = await graphService.getFullGraph()

    // 按类型过滤
    let filteredNodes = nodes
    if (nodeType) {
      filteredNodes = nodes.filter(n => n.type === nodeType)
    }

    // 如果需要增强市场数据
    if (enhance) {
      const enhancedNodes = await graphMarketDataService.enhanceNodes(filteredNodes)

      return NextResponse.json({
        success: true,
        data: {
          nodes: enhancedNodes,
          edges: edges.filter(e =>
            enhancedNodes.some(n => n.id === e.sourceId) &&
            enhancedNodes.some(n => n.id === e.targetId)
          )
        }
      })
    }

    return NextResponse.json({
      success: true,
      data: { nodes: filteredNodes, edges }
    })
  } catch (error) {
    console.error('获取增强图谱数据失败:', error)
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : '获取图谱数据失败'
      },
      { status: 500 }
    )
  }
}
