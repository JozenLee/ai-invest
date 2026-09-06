import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db/prisma'
import {
  getTypeLabel,
  getDriverTypeLabel,
  getStatusLabel,
  getFetchStatusLabel,
  getScheduleTypeLabel,
  getCategoryLabel
} from '@/lib/constants/datasource-labels'

/**
 * GET /api/datasources
 * 获取所有数据源列表（从数据库读取）
 *
 * Query参数:
 * - type: 数据源类型过滤
 * - category: 数据源分类过滤
 * - isActive: 是否激活
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const type = searchParams.get('type')
    const category = searchParams.get('category')
    const isActive = searchParams.get('isActive')

    // 构建查询条件
    const where: any = {}
    if (type) where.type = type
    if (category) where.category = category
    if (isActive !== null) where.isActive = isActive === 'true'

    // 查询数据库
    const dataSources = await prisma.dataSource.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      include: {
        schedulerJobs: true,
        logs: {
          orderBy: { createdAt: 'desc' },
          take: 1
        },
        _count: {
          select: {
            articles: true,
            logs: true,
            schedulerJobs: true
          }
        }
      }
    })

    // 格式化响应
    const priority: Record<string, number> = { tushare: 0, newsnow: 1, akshare: 2 }
    dataSources.sort((a, b) => (priority[a.provider] ?? 99) - (priority[b.provider] ?? 99) || a.name.localeCompare(b.name, 'zh-CN'))
    const formatted = dataSources.map(ds => {
      // 获取第一个调度任务（如果存在）
      const schedulerJob = ds.schedulerJobs[0] || null

      // 获取最近一次采集日志
      const lastLog = ds.logs[0] || null

      return {
        id: ds.id,
        name: ds.name,
        category: ds.category,
        categoryLabel: getCategoryLabel(ds.category),
        type: ds.type,
        typeLabel: getTypeLabel(ds.type),
        driverType: ds.driverType,
        driverTypeLabel: getDriverTypeLabel(ds.driverType),
        provider: ds.provider,
        config: JSON.parse(ds.config),
        configSchema: ds.configSchema ? JSON.parse(ds.configSchema) : null,
        updateFrequency: ds.updateFrequency,
        isActive: ds.isActive,
        statusLabel: getStatusLabel(ds.isActive),
        lastFetchAt: ds.lastFetchAt?.toISOString(),
        lastFetchStatus: ds.lastFetchStatus,
        lastFetchStatusLabel: getFetchStatusLabel(ds.lastFetchStatus),
        lastFetchCount: lastLog?.fetchedCount || 0,
        lastProcessedCount: lastLog?.processedCount || 0,
        lastFailedCount: lastLog?.failedCount || 0,
        errorMessage: ds.errorMessage,
        createdAt: ds.createdAt.toISOString(),
        updatedAt: ds.updatedAt.toISOString(),
        scheduler: schedulerJob ? {
          id: schedulerJob.id,
          scheduleType: schedulerJob.scheduleType,
          scheduleTypeLabel: getScheduleTypeLabel(schedulerJob.scheduleType),
          scheduleConfig: JSON.parse(schedulerJob.scheduleConfig),
          isEnabled: schedulerJob.isEnabled,
          lastRunAt: schedulerJob.lastRunAt?.toISOString(),
          nextRunAt: schedulerJob.nextRunAt?.toISOString()
        } : null,
        stats: {
          articlesCount: ds._count.articles,
          logsCount: ds._count.logs,
          jobsCount: ds._count.schedulerJobs
        }
      }
    })

    return NextResponse.json({
      success: true,
      data: formatted,
      count: formatted.length
    })

  } catch (error) {
    console.error('获取数据源列表失败:', error)
    return NextResponse.json(
      {
        success: false,
        error: '获取数据源列表失败',
        message: error instanceof Error ? error.message : '未知错误'
      },
      { status: 500 }
    )
  }
}

/**
 * POST /api/datasources
 * 创建新数据源
 *
 * Body:
 * - name: 数据源名称
 * - type: 类型 (financial/social/video/custom)
 * - driverType: 驱动类型 (api/crawler/rss/social)
 * - provider: 提供商标识
 * - config: 配置信息 (JSON)
 * - updateFrequency: 更新频率（分钟）
 * - isActive: 是否激活
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()

    // 验证必填字段
    const { name, type, driverType, provider, config } = body
    if (!name || !type || !driverType || !provider || !config) {
      return NextResponse.json(
        {
          success: false,
          error: '缺少必填字段',
          required: ['name', 'type', 'driverType', 'provider', 'config']
        },
        { status: 400 }
      )
    }

    // 验证类型
    const validTypes = ['financial', 'social', 'video', 'custom']
    const validDriverTypes = ['api', 'crawler', 'rss', 'social']

    if (!validTypes.includes(type)) {
      return NextResponse.json(
        { success: false, error: `无效的type，必须是: ${validTypes.join(', ')}` },
        { status: 400 }
      )
    }

    if (!validDriverTypes.includes(driverType)) {
      return NextResponse.json(
        { success: false, error: `无效的driverType，必须是: ${validDriverTypes.join(', ')}` },
        { status: 400 }
      )
    }

    // 创建数据源
    const dataSource = await prisma.dataSource.create({
      data: {
        name,
        type,
        driverType,
        provider,
        config: JSON.stringify(config),
        configSchema: body.configSchema ? JSON.stringify(body.configSchema) : null,
        updateFrequency: body.updateFrequency || 60,
        isActive: body.isActive ?? true
      }
    })

    return NextResponse.json({
      success: true,
      data: {
        id: dataSource.id,
        name: dataSource.name,
        type: dataSource.type,
        driverType: dataSource.driverType,
        provider: dataSource.provider,
        isActive: dataSource.isActive,
        createdAt: dataSource.createdAt.toISOString()
      },
      message: '数据源创建成功'
    }, { status: 201 })

  } catch (error) {
    console.error('创建数据源失败:', error)
    return NextResponse.json(
      {
        success: false,
        error: '创建数据源失败',
        message: error instanceof Error ? error.message : '未知错误'
      },
      { status: 500 }
    )
  }
}
