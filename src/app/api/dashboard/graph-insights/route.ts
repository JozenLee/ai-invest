import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/lib/db/prisma'
import { GraphInsightsData, NodeScoreDTO, SubGraphHealth } from '@/types/scoring'

export async function GET(request: NextRequest) {
  try {
    // 1. Get top rising nodes (totalScore > 60, trend = 'up')
    const risingNodes = await prisma.graphNode.findMany({
      where: {
        totalScore: { gte: 60 },
        trendIndicator: 'up',
      },
      include: {
        stocks: {
          select: { stockCode: true },
        },
      },
      orderBy: { totalScore: 'desc' },
      take: 10,
    })

    const subGraphIds = [...new Set(risingNodes.map((n) => n.subGraphId).filter(Boolean))]
    const subGraphs = await prisma.subGraph.findMany({
      where: { id: { in: subGraphIds as string[] } },
      select: { id: true, name: true },
    })
    const subGraphMap = new Map(subGraphs.map((sg) => [sg.id, sg.name]))

    const topRisingNodes: NodeScoreDTO[] = risingNodes.map((node) => ({
      nodeId: node.id,
      nodeName: node.name,
      subGraphId: node.subGraphId || '',
      subGraphName: subGraphMap.get(node.subGraphId || '') || '',
      totalScore: node.totalScore,
      scoreChange7d: 0, // Simplified for Phase 1
      trendIndicator: 'up',
      relatedETFs: node.stocks?.map((s) => s.stockCode) || [],
    }))

    // 2. Get subgraph health
    const allSubGraphs = await prisma.subGraph.findMany({
      where: { isActive: true },
      orderBy: { sortOrder: 'asc' },
    })

    const subGraphHealth: SubGraphHealth[] = await Promise.all(
      allSubGraphs.map(async (sg) => {
        const nodes = await prisma.graphNode.findMany({
          where: { subGraphId: sg.id },
          select: { totalScore: true },
        })

        const activeNodes = nodes.filter((n) => n.totalScore > 60)
        const avgScore =
          nodes.length > 0
            ? nodes.reduce((sum, n) => sum + n.totalScore, 0) / nodes.length
            : 0

        // Count active signals for this subgraph
        const signalCount = await prisma.investmentSignal.count({
          where: {
            subGraphId: sg.id,
            status: 'active',
          },
        })

        return {
          subGraphId: sg.id,
          name: sg.name,
          category: sg.category,
          avgScore: Math.round(avgScore * 10) / 10,
          nodeCount: nodes.length,
          activeNodeCount: activeNodes.length,
          signalCount,
        }
      })
    )

    // 3. Cross-sector heatmap (simplified for Phase 1)
    // Count cross-graph edges
    const crossEdges = await prisma.graphEdge.findMany({
      where: { isCrossGraph: true },
      include: {
        source: { select: { subGraphId: true } },
        target: { select: { subGraphId: true } },
      },
    })

    const heatmapMap = new Map<string, number>()
    crossEdges.forEach((edge) => {
      const sourceGraph = edge.source.subGraphId || 'unknown'
      const targetGraph = edge.target.subGraphId || 'unknown'
      const key = `${sourceGraph}->${targetGraph}`
      heatmapMap.set(key, (heatmapMap.get(key) || 0) + 1)
    })

    const crossSectorHeatmap = Array.from(heatmapMap.entries()).map(([key, count]) => {
      const [source, target] = key.split('->')
      return {
        sourceGraph: source,
        targetGraph: target,
        propagationCount: count,
      }
    })

    const response: GraphInsightsData = {
      topRisingNodes,
      subGraphHealth,
      crossSectorHeatmap,
      lastUpdated: new Date().toISOString(),
    }

    return NextResponse.json(response)
  } catch (error) {
    console.error('Error fetching graph insights:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
