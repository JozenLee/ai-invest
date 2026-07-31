import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/lib/db/prisma'
import { NodeScoreDTO } from '@/types/scoring'

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const subGraphId = searchParams.get('subGraphId')
    const limit = parseInt(searchParams.get('limit') || '10', 10)
    const sortBy = searchParams.get('sortBy') || 'totalScore'
    const trend = searchParams.get('trend') // 'up' | 'down' | 'stable'

    // Build where clause
    const where: any = {
      totalScore: { gt: 0 }, // Only nodes with scores
    }

    if (subGraphId) {
      where.subGraphId = subGraphId
    }

    if (trend) {
      where.trendIndicator = trend
    }

    // Fetch nodes
    const nodes = await prisma.graphNode.findMany({
      where,
      include: {
        stocks: {
          select: { stockCode: true },
        },
      },
      orderBy:
        sortBy === 'totalScore'
          ? { totalScore: 'desc' }
          : { scoreUpdatedAt: 'desc' },
      take: Math.min(limit, 50),
    })

    // Get subgraph names
    const subGraphIds = [...new Set(nodes.map((n) => n.subGraphId).filter(Boolean))]
    const subGraphs = await prisma.subGraph.findMany({
      where: { id: { in: subGraphIds as string[] } },
      select: { id: true, name: true },
    })
    const subGraphMap = new Map(subGraphs.map((sg) => [sg.id, sg.name]))

    // Calculate 7-day score change
    const nodeIds = nodes.map((n) => n.id)
    const sevenDaysAgo = new Date()
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7)

    const historicalScores = await prisma.nodeScoreHistory.findMany({
      where: {
        nodeId: { in: nodeIds },
        date: { gte: sevenDaysAgo },
      },
      orderBy: { date: 'asc' },
    })

    const scoreChangeMap = new Map<string, number>()
    historicalScores.forEach((h) => {
      if (!scoreChangeMap.has(h.nodeId)) {
        scoreChangeMap.set(h.nodeId, h.totalScore)
      }
    })

    // Build response
    const response: NodeScoreDTO[] = nodes.map((node) => {
      const oldScore = scoreChangeMap.get(node.id) || node.totalScore
      const scoreChange7d = node.totalScore - oldScore

      return {
        nodeId: node.id,
        nodeName: node.name,
        subGraphId: node.subGraphId || '',
        subGraphName: subGraphMap.get(node.subGraphId || '') || '',
        totalScore: node.totalScore,
        scoreChange7d,
        trendIndicator: (node.trendIndicator as 'up' | 'down' | 'stable') || 'stable',
        relatedETFs: node.stocks?.map((s) => s.stockCode) || [],
      }
    })

    return NextResponse.json({
      nodes: response,
      total: response.length,
    })
  } catch (error) {
    console.error('Error fetching score ranking:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
