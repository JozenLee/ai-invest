import { NextResponse } from 'next/server'
import { PathFinderService } from '@/lib/services/path-finder.service'
import { prisma } from '@/lib/db'

export async function POST(request: Request) {
  try {
    const body = await request.json()
    const {
      sourceNodeId,
      targetNodeId,
      maxDepth,
      maxPaths,
      relationTypes
    } = body

    if (!sourceNodeId || !targetNodeId) {
      return NextResponse.json(
        { success: false, error: '缺少必要参数: sourceNodeId, targetNodeId' },
        { status: 400 }
      )
    }

    // Find paths
    const pathFinder = new PathFinderService()
    const paths = await pathFinder.findPaths(sourceNodeId, targetNodeId, {
      maxDepth,
      maxPaths,
      relationTypes
    })

    // Get source and target node details
    const [sourceNode, targetNode] = await Promise.all([
      prisma.graphNode.findUnique({ where: { id: sourceNodeId } }),
      prisma.graphNode.findUnique({ where: { id: targetNodeId } })
    ])

    if (!sourceNode || !targetNode) {
      return NextResponse.json(
        { success: false, error: '节点不存在' },
        { status: 404 }
      )
    }

    return NextResponse.json({
      success: true,
      data: {
        sourceNode: {
          id: sourceNode.id,
          name: sourceNode.name,
          type: sourceNode.type
        },
        targetNode: {
          id: targetNode.id,
          name: targetNode.name,
          type: targetNode.type
        },
        paths
      }
    })
  } catch (error) {
    console.error('路径查询失败:', error)
    return NextResponse.json(
      { success: false, error: '路径查询失败' },
      { status: 500 }
    )
  }
}
