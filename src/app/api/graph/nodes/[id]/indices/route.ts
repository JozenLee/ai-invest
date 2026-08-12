// API路由：获取节点的指数绑定列表
// GET /api/graph/nodes/[id]/indices

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params

    const indices = await prisma.graphNodeIndex.findMany({
      where: {
        nodeId: id,
        isActive: true,
      },
      orderBy: {
        relevance: 'desc',
      },
    })

    return NextResponse.json({
      success: true,
      data: indices,
    })
  } catch (error) {
    console.error('获取节点指数绑定失败:', error)
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : '获取失败',
      },
      { status: 500 }
    )
  }
}

// POST /api/graph/nodes/[id]/indices - 创建指数绑定
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const body = await request.json()
    const { indexCode, indexName, relevance, description } = body

    if (!indexCode || !indexName) {
      return NextResponse.json(
        { success: false, error: '缺少必要参数：indexCode 和 indexName' },
        { status: 400 }
      )
    }

    // 检查是否已存在
    const existing = await prisma.graphNodeIndex.findUnique({
      where: {
        nodeId_indexCode: {
          nodeId: id,
          indexCode,
        },
      },
    })

    if (existing) {
      return NextResponse.json(
        { success: false, error: '该指数已绑定到此节点' },
        { status: 409 }
      )
    }

    const index = await prisma.graphNodeIndex.create({
      data: {
        nodeId: id,
        indexCode,
        indexName,
        relevance: relevance || 1.0,
        description: description || null,
        isActive: true,
      },
    })

    return NextResponse.json({
      success: true,
      data: index,
    })
  } catch (error) {
    console.error('创建指数绑定失败:', error)
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : '创建失败',
      },
      { status: 500 }
    )
  }
}
