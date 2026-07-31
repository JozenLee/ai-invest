import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/lib/db/prisma'
import { NodeScoreDetail } from '@/types/scoring'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params

    // Get node with score data
    const node = await prisma.graphNode.findUnique({
      where: { id },
      include: {
        scoreHistory: {
          orderBy: { date: 'desc' },
          take: 30,
        },
        stocks: {
          select: {
            stockCode: true,
            stockName: true,
          },
        },
      },
    })

    if (!node) {
      return NextResponse.json(
        { error: 'Node not found' },
        { status: 404 }
      )
    }

    // Get subgraph info
    const subGraph = node.subGraphId
      ? await prisma.subGraph.findUnique({
          where: { id: node.subGraphId },
          select: { name: true },
        })
      : null

    // Parse score components
    let scoreComponents = {
      marketFundamental: 0,
      newsSentiment: 0,
      graphStructure: 0,
    }

    if (node.scoreComponents) {
      try {
        scoreComponents = JSON.parse(node.scoreComponents)
      } catch (e) {
        // Use defaults
      }
    }

    // Map to ETFs (simplified for Phase 1)
    const relatedETFs =
      node.stocks?.map((s) => ({
        ticker: s.stockCode,
        name: s.stockName,
      })) || []

    // Build response
    const response: NodeScoreDetail = {
      nodeId: node.id,
      nodeName: node.name,
      subGraphId: node.subGraphId || '',
      subGraphName: subGraph?.name || '',
      totalScore: node.totalScore,
      scoreComponents,
      trendIndicator: (node.trendIndicator as 'up' | 'down' | 'stable') || 'stable',
      scoreUpdatedAt: node.scoreUpdatedAt,
      relatedETFs,
      scoreHistory: node.scoreHistory.map((h) => ({
        date: h.date.toISOString().split('T')[0],
        score: h.totalScore,
      })),
    }

    return NextResponse.json(response)
  } catch (error) {
    console.error('Error fetching node score:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
