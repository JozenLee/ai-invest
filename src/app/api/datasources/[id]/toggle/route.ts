import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db/prisma'

/**
 * POST /api/datasources/[id]/toggle
 * 切换数据源启用/停用状态
 *
 * 功能：
 * - 更新 DataSource.isActive
 * - 同步更新关联的 SchedulerJob.isEnabled
 *
 * Body:
 * - isActive: boolean (true=启用, false=停用)
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const body = await request.json()

    // 验证请求体
    if (typeof body.isActive !== 'boolean') {
      return NextResponse.json(
        {
          success: false,
          error: '参数错误',
          message: 'isActive 必须是布尔值'
        },
        { status: 400 }
      )
    }

    const { isActive } = body

    // 检查数据源是否存在
    const dataSource = await prisma.dataSource.findUnique({
      where: { id },
      include: {
        schedulerJobs: true
      }
    })

    if (!dataSource) {
      return NextResponse.json(
        { success: false, error: '数据源不存在' },
        { status: 404 }
      )
    }

    // 使用事务同时更新数据源和调度任务
    const result = await prisma.$transaction(async (tx) => {
      // 更新数据源状态
      const updatedDataSource = await tx.dataSource.update({
        where: { id },
        data: { isActive }
      })

      // 更新所有关联的调度任务
      const updatedJobs = await tx.schedulerJob.updateMany({
        where: { sourceId: id },
        data: { isEnabled: isActive }
      })

      return {
        dataSource: updatedDataSource,
        jobsUpdated: updatedJobs.count
      }
    })

    // 通知 Python 调度服务同步更新调度器
    try {
      const pythonServiceUrl = process.env.PYTHON_SERVICE_URL || 'http://localhost:8000'

      // 解析配置
      let driverConfig = {}
      try {
        driverConfig = JSON.parse(dataSource.config || '{}')
      } catch {
        driverConfig = {}
      }

      // 添加必要字段
      driverConfig = {
        ...driverConfig,
        driverType: dataSource.driverType,
        provider: dataSource.provider
      }

      const toggleResponse = await fetch(`${pythonServiceUrl}/api/datasources/${id}/toggle`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          isActive,
          updateFrequency: dataSource.updateFrequency || 0,
          driverConfig
        })
      })

      if (!toggleResponse.ok) {
        console.warn(`Python 调度服务同步失败: ${toggleResponse.status}`)
      } else {
        console.log(`Python 调度服务已同步: source_id=${id}, isActive=${isActive}`)
      }
    } catch (pythonError) {
      // Python 服务不可用时不阻塞主流程
      console.warn('无法连接 Python 调度服务:', pythonError)
    }

    return NextResponse.json({
      success: true,
      data: {
        id: result.dataSource.id,
        name: result.dataSource.name,
        isActive: result.dataSource.isActive,
        jobsUpdated: result.jobsUpdated,
        updatedAt: result.dataSource.updatedAt.toISOString()
      },
      message: isActive ? '已启用数据源' : '已停用数据源'
    })

  } catch (error) {
    console.error('切换数据源状态失败:', error)
    return NextResponse.json(
      {
        success: false,
        error: '切换数据源状态失败',
        message: error instanceof Error ? error.message : '未知错误'
      },
      { status: 500 }
    )
  }
}
