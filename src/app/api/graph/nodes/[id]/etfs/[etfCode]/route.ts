import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db/prisma'

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; etfCode: string }> }
) {
  try {
    const { id: nodeId, etfCode } = await params

    // 查找绑定
    const binding = await prisma.graphNodeETF.findUnique({
      where: {
        nodeId_etfCode: {
          nodeId,
          etfCode
        }
      }
    })

    if (!binding) {
      return NextResponse.json(
        { success: false, error: 'ETF binding not found' },
        { status: 404 }
      )
    }

    // 软删除（设为inactive）
    await prisma.graphNodeETF.update({
      where: {
        nodeId_etfCode: {
          nodeId,
          etfCode
        }
      },
      data: { isActive: false }
    })

    return NextResponse.json({
      success: true
    })

  } catch (error) {
    console.error('Failed to delete ETF binding:', error)
    return NextResponse.json(
      { success: false, error: 'Failed to delete ETF binding' },
      { status: 500 }
    )
  }
}
