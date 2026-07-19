import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db/prisma'

/**
 * PATCH /api/datasources/[id]/schedule
 * 更新数据源调度配置
 *
 * 功能：
 * - 更新 DataSource.updateFrequency (更新频率，单位：分钟)
 * - 更新关联的 SchedulerJob.scheduleConfig (调度配置)
 *
 * Body:
 * - updateFrequency?: number (可选，更新频率，单位：分钟)
 * - scheduleType?: string (可选，调度类型：cron/interval/webhook)
 * - scheduleConfig?: string (可选，调度配置，JSON字符串)
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const body = await request.json()

    // 验证请求体
    if (body.updateFrequency !== undefined) {
      if (typeof body.updateFrequency !== 'number' || body.updateFrequency <= 0) {
        return NextResponse.json(
          {
            success: false,
            error: '参数错误',
            message: 'updateFrequency 必须是大于0的数字'
          },
          { status: 400 }
        )
      }
    }

    if (body.scheduleType !== undefined) {
      const validTypes = ['cron', 'interval', 'webhook']
      if (!validTypes.includes(body.scheduleType)) {
        return NextResponse.json(
          {
            success: false,
            error: '参数错误',
            message: 'scheduleType 必须是 cron、interval 或 webhook'
          },
          { status: 400 }
        )
      }
    }

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

    // 使用事务更新数据源和调度任务
    const result = await prisma.$transaction(async (tx) => {
      // 更新数据源的更新频率
      const dataSourceUpdate: any = {}
      if (body.updateFrequency !== undefined) {
        dataSourceUpdate.updateFrequency = body.updateFrequency
      }

      let updatedDataSource = dataSource
      if (Object.keys(dataSourceUpdate).length > 0) {
        updatedDataSource = await tx.dataSource.update({
          where: { id },
          data: dataSourceUpdate,
          include: {
            schedulerJobs: true
          }
        })
      }

      // 更新调度任务配置
      let jobsUpdated = 0
      if (dataSource.schedulerJobs.length > 0) {
        const jobUpdate: any = {}

        if (body.scheduleType !== undefined) {
          jobUpdate.scheduleType = body.scheduleType
        }

        if (body.scheduleConfig !== undefined) {
          jobUpdate.scheduleConfig = body.scheduleConfig
        } else if (body.updateFrequency !== undefined && body.scheduleType === undefined) {
          // 如果只更新频率，且调度类型是 interval，自动更新 scheduleConfig
          for (const job of dataSource.schedulerJobs) {
            if (job.scheduleType === 'interval') {
              await tx.schedulerJob.update({
                where: { id: job.id },
                data: {
                  scheduleConfig: JSON.stringify({ intervalMinutes: body.updateFrequency })
                }
              })
              jobsUpdated++
            }
          }
        }

        // 如果有其他更新，应用到所有调度任务
        if (Object.keys(jobUpdate).length > 0) {
          const updateResult = await tx.schedulerJob.updateMany({
            where: { sourceId: id },
            data: jobUpdate
          })
          jobsUpdated = updateResult.count
        }
      }

      return {
        dataSource: updatedDataSource,
        jobsUpdated
      }
    })

    return NextResponse.json({
      success: true,
      data: {
        id: result.dataSource.id,
        name: result.dataSource.name,
        updateFrequency: result.dataSource.updateFrequency,
        jobsUpdated: result.jobsUpdated,
        updatedAt: result.dataSource.updatedAt.toISOString()
      },
      message: '调度配置已更新'
    })

  } catch (error) {
    console.error('更新调度配置失败:', error)
    return NextResponse.json(
      {
        success: false,
        error: '更新调度配置失败',
        message: error instanceof Error ? error.message : '未知错误'
      },
      { status: 500 }
    )
  }
}
