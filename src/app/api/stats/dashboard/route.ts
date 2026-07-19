import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/lib/db/prisma'

/**
 * GET /api/stats/dashboard
 * 获取仪表盘统计数据
 */
export async function GET(request: NextRequest) {
  try {
    const today = new Date()
    today.setHours(0, 0, 0, 0)

    // 并行查询所有统计数据
    const [
      // 数据源统计
      totalSources,
      activeSources,
      lastFetchSource,

      // 文章统计
      totalArticles,
      todayArticles,
      aiProcessedArticles,
      articlesBySource,

      // 情感分布
      bullishCount,
      neutralCount,
      bearishCount,

      // 采集成功率（最近24小时）
      recentLogs,
    ] = await Promise.all([
      // 数据源统计
      prisma.dataSource.count(),
      prisma.dataSource.count({ where: { isActive: true } }),
      prisma.dataSource.findFirst({
        orderBy: { lastFetchAt: 'desc' },
        select: { lastFetchAt: true }
      }),

      // 文章统计
      prisma.newsArticle.count(),
      prisma.newsArticle.count({
        where: { createdAt: { gte: today } }
      }),
      prisma.newsArticle.count({
        where: { aiProcessed: true }
      }),
      prisma.newsArticle.groupBy({
        by: ['source'],
        _count: true,
        orderBy: { _count: { source: 'desc' } },
        take: 10
      }),

      // 情感分布
      prisma.newsArticle.count({
        where: { sentiment: { gt: 0.2 } }
      }),
      prisma.newsArticle.count({
        where: { sentiment: { gte: -0.2, lte: 0.2 } }
      }),
      prisma.newsArticle.count({
        where: { sentiment: { lt: -0.2 } }
      }),

      // 最近24小时的采集日志
      prisma.dataSourceLog.findMany({
        where: {
          createdAt: {
            gte: new Date(Date.now() - 24 * 60 * 60 * 1000)
          }
        },
        select: {
          status: true,
          fetchedCount: true
        }
      })
    ])

    // 计算采集成功率
    const successLogs = recentLogs.filter(log => log.status === 'success')
    const fetchSuccessRate = recentLogs.length > 0
      ? (successLogs.length / recentLogs.length) * 100
      : 0

    // 计算总采集数量
    const totalFetched = recentLogs.reduce((sum, log) => sum + (log.fetchedCount || 0), 0)

    return NextResponse.json({
      success: true,
      data: {
        dataSources: {
          total: totalSources,
          active: activeSources,
          lastFetch: lastFetchSource?.lastFetchAt?.toISOString() || null
        },
        articles: {
          total: totalArticles,
          today: todayArticles,
          aiProcessed: aiProcessedArticles,
          bySource: articlesBySource.map(item => ({
            source: item.source,
            count: item._count
          }))
        },
        sentiment: {
          bullish: bullishCount,
          neutral: neutralCount,
          bearish: bearishCount
        },
        fetch: {
          successRate: Math.round(fetchSuccessRate * 10) / 10,
          last24h: {
            total: recentLogs.length,
            success: successLogs.length,
            fetched: totalFetched
          }
        }
      }
    })

  } catch (error) {
    console.error('获取仪表盘统计失败:', error)
    return NextResponse.json(
      {
        success: false,
        error: '获取统计数据失败',
        message: error instanceof Error ? error.message : '未知错误'
      },
      { status: 500 }
    )
  }
}
