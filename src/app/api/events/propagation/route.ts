import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db/prisma'

// GET /api/events/propagation?domainId=xxx
// 获取领域的传导路径
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const domainId = searchParams.get('domainId')

    if (!domainId) {
      return NextResponse.json(
        { success: false, error: '领域ID为必填项' },
        { status: 400 }
      )
    }

    // 获取领域信息
    const domain = await prisma.domain.findUnique({
      where: { id: domainId },
    })

    if (!domain) {
      return NextResponse.json(
        { success: false, error: '领域不存在' },
        { status: 404 }
      )
    }

    // 解析关联的图谱节点
    const graphNodeIds = domain.graphNodes ? JSON.parse(domain.graphNodes) : []

    if (graphNodeIds.length === 0) {
      // 如果没有关联节点，直接返回空结果
      return NextResponse.json({
        success: true,
        data: {
          domain: domain.name,
          nodes: [],
          edges: [],
          propagationPath: [],
        },
      })
    }

    // 获取关联的节点
    const nodes = await prisma.graphNode.findMany({
      where: {
        id: { in: graphNodeIds },
      },
    })

    // 获取节点之间的边
    const edges = await prisma.graphEdge.findMany({
      where: {
        OR: [
          { sourceId: { in: graphNodeIds } },
          { targetId: { in: graphNodeIds } },
        ],
      },
      include: {
        source: true,
        target: true,
      },
    })

    // 构建传导路径
    const propagationPath = buildPropagationPath(
      nodes,
      edges.map((edge) => ({
        sourceId: edge.sourceId,
        targetId: edge.targetId,
        sourceName: edge.source.name,
        targetName: edge.target.name,
        weight: edge.weight,
        direction: edge.direction,
      }))
    )

    return NextResponse.json({
      success: true,
      data: {
        domain: domain.name,
        nodes: nodes.map((node) => ({
          id: node.id,
          name: node.name,
          type: node.type,
          level: node.level,
          cyclePos: node.cyclePos,
          momentum: node.momentum,
        })),
        edges: edges.map((edge) => ({
          id: edge.id,
          sourceId: edge.sourceId,
          targetId: edge.targetId,
          sourceName: edge.source.name,
          targetName: edge.target.name,
          relation: edge.relation,
          weight: edge.weight,
          direction: edge.direction,
          lag: edge.lag,
        })),
        propagationPath,
      },
    })
  } catch (error) {
    console.error('获取传导路径失败:', error)
    return NextResponse.json(
      { success: false, error: '获取传导路径失败' },
      { status: 500 }
    )
  }
}

// 构建传导路径
interface PropagationNode {
  id: string
  name: string
  impact: number
  direction: 'positive' | 'negative'
  level: number
}

function buildPropagationPath(
  nodes: Array<{ id: string; name: string; level: number }>,
  edges: Array<{
    sourceId: string
    targetId: string
    sourceName: string
    targetName: string
    weight: number
    direction: string
  }>
): PropagationNode[] {
  // 按level排序节点
  const sortedNodes = [...nodes].sort((a, b) => a.level - b.level)

  // 构建路径
  const path: PropagationNode[] = sortedNodes.map((node) => {
    // 找到指向该节点的边，计算影响权重
    const incomingEdge = edges.find((e) => e.targetId === node.id)
    const impact = incomingEdge ? incomingEdge.weight : 0.5

    return {
      id: node.id,
      name: node.name,
      impact,
      direction: (incomingEdge?.direction as 'positive' | 'negative') || 'positive',
      level: node.level,
    }
  })

  return path
}
