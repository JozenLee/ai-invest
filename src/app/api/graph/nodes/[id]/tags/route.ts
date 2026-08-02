import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db/prisma'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params

    const tags = await prisma.graphNodeTag.findMany({
      where: {
        nodeId: id,
      },
      include: {
        tag: true,
      },
      orderBy: {
        relevance: 'desc',
      },
    })

    return NextResponse.json({
      success: true,
      data: tags,
    })
  } catch (error) {
    console.error('获取节点标签失败:', error)
    return NextResponse.json(
      {
        success: false,
        error: '获取节点标签失败',
      },
      { status: 500 }
    )
  }
}
