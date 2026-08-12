import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db/prisma'

/**
 * POST /api/datasources/batch/enable
 * 批量启用数据源
 *
 * Body:
 * - ids: string[] - 数据源ID数组
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { ids } = body

    if (!ids || !Array.isArray(ids) || ids.length === 0) {
      return NextResponse.json(
        {
          success: false,
          error: '缺少必填字段',
          message: 'ids 必须是非空数组'
        },
        { status: 400 }
      )
    }

    // 批量更新数据源状态
    const result = await prisma.dataSource.updateMany({
      where: {
        id: { in: ids }
      },
      data: {
        isActive: true
      }
    })

    return NextResponse.json({
      success: true,
      updated: result.count,
      message: `成功启用 ${result.count} 个数据源`
    })

  } catch (error) {
    console.error('批量启用数据源失败:', error)
    return NextResponse.json(
      {
        success: false,
        error: '批量启用数据源失败',
        message: error instanceof Error ? error.message : '未知错误'
      },
      { status: 500 }
    )
  }
}
