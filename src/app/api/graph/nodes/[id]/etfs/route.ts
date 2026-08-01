import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db/prisma'

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const nodeId = params.id

    // 验证节点存在
    const node = await prisma.graphNode.findUnique({
      where: { id: nodeId }
    })

    if (!node) {
      return NextResponse.json(
        { success: false, error: 'Node not found' },
        { status: 404 }
      )
    }

    // 查询ETF绑定
    const bindings = await prisma.graphNodeETF.findMany({
      where: { nodeId, isActive: true },
      orderBy: { weight: 'desc' }
    })

    return NextResponse.json({
      success: true,
      data: bindings
    })

  } catch (error) {
    console.error('Failed to get node ETF bindings:', error)
    return NextResponse.json(
      { success: false, error: 'Failed to get ETF bindings' },
      { status: 500 }
    )
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const nodeId = params.id
    const body = await request.json()

    // 验证节点存在
    const node = await prisma.graphNode.findUnique({
      where: { id: nodeId }
    })

    if (!node) {
      return NextResponse.json(
        { success: false, error: 'Node not found' },
        { status: 404 }
      )
    }

    // 创建绑定
    const binding = await prisma.graphNodeETF.create({
      data: {
        nodeId,
        etfCode: body.etfCode,
        etfName: body.etfName,
        bindType: body.bindType || 'tracking',
        weight: body.weight || 1.0,
        description: body.description,
        isActive: true
      }
    })

    return NextResponse.json({
      success: true,
      data: binding
    })

  } catch (error) {
    console.error('Failed to create ETF binding:', error)

    // 处理唯一约束错误
    if (error instanceof Error && error.message.includes('Unique constraint')) {
      return NextResponse.json(
        { success: false, error: 'ETF binding already exists' },
        { status: 400 }
      )
    }

    return NextResponse.json(
      { success: false, error: 'Failed to create ETF binding' },
      { status: 500 }
    )
  }
}
