import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db/prisma'

/**
 * GET /api/datasources/[id]
 * 获取单个数据源详情
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const dataSource = await prisma.dataSource.findUnique({
      where: { id },
      include: {
        _count: {
          select: {
            articles: true,
            logs: true,
            schedulerJobs: true
          }
        },
        logs: {
          take: 10,
          orderBy: { createdAt: 'desc' }
        }
      }
    })

    if (!dataSource) {
      return NextResponse.json(
        { success: false, error: '数据源不存在' },
        { status: 404 }
      )
    }

    return NextResponse.json({
      success: true,
      data: {
        id: dataSource.id,
        name: dataSource.name,
        type: dataSource.type,
        driverType: dataSource.driverType,
        provider: dataSource.provider,
        config: JSON.parse(dataSource.config),
        configSchema: dataSource.configSchema ? JSON.parse(dataSource.configSchema) : null,
        updateFrequency: dataSource.updateFrequency,
        isActive: dataSource.isActive,
        lastFetchAt: dataSource.lastFetchAt?.toISOString(),
        lastFetchStatus: dataSource.lastFetchStatus,
        errorMessage: dataSource.errorMessage,
        createdAt: dataSource.createdAt.toISOString(),
        updatedAt: dataSource.updatedAt.toISOString(),
        stats: {
          articlesCount: dataSource._count.articles,
          logsCount: dataSource._count.logs,
          jobsCount: dataSource._count.schedulerJobs
        },
        recentLogs: dataSource.logs.map(log => ({
          id: log.id,
          status: log.status,
          message: log.message,
          fetchedCount: log.fetchedCount,
          processedCount: log.processedCount,
          failedCount: log.failedCount,
          duration: log.duration,
          createdAt: log.createdAt.toISOString()
        }))
      }
    })

  } catch (error) {
    console.error('获取数据源详情失败:', error)
    return NextResponse.json(
      {
        success: false,
        error: '获取数据源详情失败',
        message: error instanceof Error ? error.message : '未知错误'
      },
      { status: 500 }
    )
  }
}

/**
 * PUT /api/datasources/[id]
 * 更新数据源配置
 */
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json()

    // 检查数据源是否存在
    const existing = await prisma.dataSource.findUnique({
      where: { id: id }
    })

    if (!existing) {
      return NextResponse.json(
        { success: false, error: '数据源不存在' },
        { status: 404 }
      )
    }

    // 构建更新数据
    const updateData: any = {}
    if (body.name !== undefined) updateData.name = body.name
    if (body.type !== undefined) updateData.type = body.type
    if (body.driverType !== undefined) updateData.driverType = body.driverType
    if (body.provider !== undefined) updateData.provider = body.provider
    if (body.config !== undefined) updateData.config = JSON.stringify(body.config)
    if (body.configSchema !== undefined) {
      updateData.configSchema = body.configSchema ? JSON.stringify(body.configSchema) : null
    }
    if (body.updateFrequency !== undefined) updateData.updateFrequency = body.updateFrequency
    if (body.isActive !== undefined) updateData.isActive = body.isActive

    // 更新数据源
    const updated = await prisma.dataSource.update({
      where: { id: id },
      data: updateData
    })

    return NextResponse.json({
      success: true,
      data: {
        id: updated.id,
        name: updated.name,
        type: updated.type,
        driverType: updated.driverType,
        isActive: updated.isActive,
        updatedAt: updated.updatedAt.toISOString()
      },
      message: '数据源更新成功'
    })

  } catch (error) {
    console.error('更新数据源失败:', error)
    return NextResponse.json(
      {
        success: false,
        error: '更新数据源失败',
        message: error instanceof Error ? error.message : '未知错误'
      },
      { status: 500 }
    )
  }
}

/**
 * DELETE /api/datasources/[id]
 * 删除数据源
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    // 检查数据源是否存在
    const existing = await prisma.dataSource.findUnique({
      where: { id: id },
      include: {
        _count: {
          select: {
            articles: true,
            schedulerJobs: true
          }
        }
      }
    })

    if (!existing) {
      return NextResponse.json(
        { success: false, error: '数据源不存在' },
        { status: 404 }
      )
    }

    // 检查是否有关联的调度任务
    if (existing._count.schedulerJobs > 0) {
      return NextResponse.json(
        {
          success: false,
          error: '数据源有关联的调度任务，请先删除调度任务',
          jobsCount: existing._count.schedulerJobs
        },
        { status: 400 }
      )
    }

    // 删除数据源（会级联删除关联的日志，但不会删除文章）
    await prisma.dataSource.delete({
      where: { id: id }
    })

    return NextResponse.json({
      success: true,
      message: '数据源删除成功',
      articlesAffected: existing._count.articles
    })

  } catch (error) {
    console.error('删除数据源失败:', error)
    return NextResponse.json(
      {
        success: false,
        error: '删除数据源失败',
        message: error instanceof Error ? error.message : '未知错误'
      },
      { status: 500 }
    )
  }
}
