import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db/prisma'

/**
 * GET /api/domains
 * 获取所有活跃的领域列表
 */
export async function GET() {
  try {
    const domains = await prisma.domain.findMany({
      where: {
        isActive: true
      },
      select: {
        id: true,
        name: true,
        code: true,
        description: true
      },
      orderBy: {
        name: 'asc'
      }
    })

    return NextResponse.json({
      success: true,
      data: domains
    })

  } catch (error) {
    console.error('获取领域列表失败:', error)
    return NextResponse.json(
      {
        success: false,
        error: '获取领域列表失败',
        message: error instanceof Error ? error.message : '未知错误'
      },
      { status: 500 }
    )
  }
}
