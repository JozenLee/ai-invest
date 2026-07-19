// 事件分析服务
// 提供新闻采集、事件分析、趋势聚合等功能

import { claudeClient, EventAnalysisRequest, EventAnalysisResponse } from '@/lib/ai/claude'
import prisma from '@/lib/db/prisma'

export interface NewsArticle {
  id: string
  title: string
  content: string
  summary?: string
  source: string
  url?: string
  publishTime: string
  category: string
  sentiment?: number
  impact?: number
  entities?: any
  sectors?: string[]
}

export interface SectorTrend {
  sector: string
  period: string
  eventSummary: {
    totalEvents: number
    sentimentDistribution: {
      bullish: number
      neutral: number
      bearish: number
    }
  }
  trendAssessment: {
    currentStatus: string
    shortTermOutlook: string
    mediumTermOutlook: string
    keyDrivers: string[]
    keyRisks: string[]
    confidenceLevel: number
  }
  topEvents: NewsArticle[]
}

const DATA_SERVICE_URL = process.env.DATA_SERVICE_URL || 'http://localhost:8000'

export class EventService {
  /**
   * 获取新闻列表（优先从本地数据库读取，降级到Python服务）
   */
  async getNewsFeed(params: {
    category?: string
    categoryIds?: string[]
    domainId?: string
    keyword?: string
    sentiment?: string
    sortBy?: string
    limit?: number
    offset?: number
  }): Promise<{ total: number; items: NewsArticle[]; source: 'local' | 'remote' }> {
    const {
      category,
      categoryIds,
      domainId,
      keyword,
      sentiment,
      sortBy = 'publishTime',
      limit = 20,
      offset = 0,
    } = params

    // 优先从本地数据库读取（定时采集的数据）
    try {
      const where: any = {}

      // 分类筛选
      if (categoryIds && categoryIds.length > 0) {
        where.categoryId = { in: categoryIds }
      } else if (category) {
        where.category = category
      }

      // 领域筛选
      if (domainId) {
        where.domainId = domainId
      }

      // 情感筛选
      if (sentiment) {
        switch (sentiment) {
          case 'bullish':
            where.sentiment = { gt: 0.2 }
            break
          case 'bearish':
            where.sentiment = { lt: -0.2 }
            break
          case 'neutral':
            where.sentiment = { gte: -0.2, lte: 0.2 }
            break
        }
      }

      // 关键词搜索 - 使用AND包装，确保与其他条件正确组合
      if (keyword) {
        const otherConditions = { ...where }
        where.AND = [
          otherConditions,
          {
            OR: [
              { title: { contains: keyword } },
              { content: { contains: keyword } },
              { summary: { contains: keyword } },
            ],
          },
        ]
        // 清除已经包含在AND中的条件
        Object.keys(otherConditions).forEach(key => {
          if (key !== 'AND') delete where[key]
        })
      }

      // 排序
      const orderBy: Record<string, string> = {}
      switch (sortBy) {
        case 'sentiment':
          orderBy.sentiment = 'desc'
          break
        case 'impact':
          orderBy.impact = 'desc'
          break
        default:
          orderBy.publishTime = 'desc'
      }

      const [total, articles] = await Promise.all([
        prisma.newsArticle.count({ where }),
        prisma.newsArticle.findMany({
          where,
          orderBy,
          skip: offset,
          take: limit,
          include: {
            categoryRef: true,
            domain: true,
            sourceRef: true,
          },
        }),
      ])

      if (total > 0) {
        console.log(`✅ 从本地数据库获取新闻: ${articles.length}/${total} 条`)

        return {
          total,
          source: 'local',
          items: articles.map((a) => ({
            id: a.id,
            title: a.title,
            content: a.content || '',
            summary: a.summary || undefined,
            source: a.sourceRef?.name || a.source || '财联社',
            url: a.url || undefined,
            publishTime: a.publishTime?.toISOString() || new Date().toISOString(),
            category: a.categoryRef?.code || a.category || 'market',
            categoryId: a.categoryId || undefined,
            categoryName: a.categoryRef?.name || undefined,
            domainId: a.domainId || undefined,
            domainName: a.domain?.name || undefined,
            sentiment: a.sentiment || undefined,
            sentimentLabel: a.sentimentLabel || undefined,
            impact: a.impact || undefined,
            entities: a.entities ? JSON.parse(a.entities as string) : undefined,
            sectors: a.sectors ? JSON.parse(a.sectors as string) : undefined,
            keywords: a.keywords ? JSON.parse(a.keywords as string) : undefined,
            aiProcessed: a.aiProcessed || false,
          })),
        }
      }

      console.log('⚠️ 本地数据库无数据，降级到Python服务')
    } catch (error) {
      console.error('❌ 本地数据库查询失败，降级到Python服务:', error)
    }

    // 降级：从Python数据服务获取
    let url = `${DATA_SERVICE_URL}/api/news/feed?limit=${limit}&offset=${offset}`
    if (category) url += `&category=${category}`
    if (keyword) url += `&keyword=${encodeURIComponent(keyword)}`

    const response = await fetch(url, {
      next: { revalidate: 300 },
      signal: AbortSignal.timeout(30000),
    })

    if (!response.ok) {
      throw new Error(`Python数据服务响应异常: ${response.status}`)
    }

    const data = await response.json()
    if (!data.success || !data.data) {
      throw new Error(data.error || '无法获取新闻数据')
    }

    console.log(`🔄 从Python服务获取新闻: ${data.data.items?.length || 0} 条`)

    return {
      total: data.data.total || 0,
      source: 'remote',
      items: data.data.items || [],
    }
  }

  /**
   * 获取AI硬件相关新闻
   */
  async getAIHardwareNews(limit: number = 20): Promise<NewsArticle[]> {
    const response = await fetch(
      `${DATA_SERVICE_URL}/api/news/ai-hardware?limit=${limit}`,
      { next: { revalidate: 300 }, signal: AbortSignal.timeout(30000) }
    )

    if (!response.ok) {
      throw new Error(`Python数据服务响应异常: ${response.status}`)
    }

    const data = await response.json()
    if (!data.success || !data.data?.items) {
      throw new Error(data.error || '无法获取AI硬件新闻数据')
    }

    return data.data.items
  }

  /**
   * 分析单条新闻事件
   */
  async analyzeEvent(article: NewsArticle): Promise<EventAnalysisResponse> {
    const request: EventAnalysisRequest = {
      title: article.title,
      content: article.content || article.summary || '',
      source: article.source,
      publishTime: article.publishTime
    }

    const analysis = await claudeClient.analyzeEvent(request)

    // 保存分析结果到数据库
    await this.saveAnalysis(article.id, analysis)

    return analysis
  }

  /**
   * 获取领域趋势
   */
  async getSectorTrend(sector: string, days: number = 7): Promise<SectorTrend> {
    const response = await fetch(
      `${DATA_SERVICE_URL}/api/news/trends/${sector}?days=${days}`,
      { next: { revalidate: 600 }, signal: AbortSignal.timeout(30000) }
    )

    if (!response.ok) {
      throw new Error(`Python数据服务响应异常: ${response.status}`)
    }

    const data = await response.json()
    if (!data.success || !data.data) {
      throw new Error(data.error || `无法获取${sector}板块趋势数据`)
    }

    return data.data
  }

  /**
   * 保存分析结果
   */
  private async saveAnalysis(articleId: string, analysis: EventAnalysisResponse): Promise<void> {
    try {
      await prisma.newsArticle.update({
        where: { id: articleId },
        data: {
          category: analysis.category,
          sentiment: analysis.sentiment.score,
          impact: analysis.impact.magnitude,
          entities: JSON.stringify(analysis.entities),
          sectors: JSON.stringify(analysis.impact.affectedSectors.map(s => s.sector)),
        }
      })
    } catch (error) {
      console.log('保存分析结果失败，文章可能不存在:', error)
    }
  }

  /**
   * 清理过期新闻（滚动存储）
   * @param retentionDays 保留天数，默认7天
   */
  async cleanupExpiredNews(retentionDays: number = 7): Promise<{ deleted: number }> {
    const cutoffDate = new Date()
    cutoffDate.setDate(cutoffDate.getDate() - retentionDays)

    try {
      const result = await prisma.newsArticle.deleteMany({
        where: {
          publishTime: {
            lt: cutoffDate.toISOString(),
          },
        },
      })

      console.log(`清理过期新闻完成: 删除 ${result.count} 条，保留 ${retentionDays} 天内数据`)
      return { deleted: result.count }
    } catch (error) {
      console.error('清理过期新闻失败:', error)
      return { deleted: 0 }
    }
  }

  /**
   * 获取新闻存储统计
   */
  async getNewsStats(): Promise<{
    total: number
    oldestDate: string | null
    newestDate: string | null
    retentionDays: number
  }> {
    try {
      const total = await prisma.newsArticle.count()

      const oldest = await prisma.newsArticle.findFirst({
        orderBy: { publishTime: 'asc' },
        select: { publishTime: true },
      })

      const newest = await prisma.newsArticle.findFirst({
        orderBy: { publishTime: 'desc' },
        select: { publishTime: true },
      })

      // 计算实际保留天数
      let retentionDays = 0
      if (oldest && newest) {
        const diffTime = new Date(newest.publishTime).getTime() - new Date(oldest.publishTime).getTime()
        retentionDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24))
      }

      return {
        total,
        oldestDate: oldest?.publishTime?.toISOString() || null,
        newestDate: newest?.publishTime?.toISOString() || null,
        retentionDays,
      }
    } catch (error) {
      console.error('获取新闻统计失败:', error)
      return {
        total: 0,
        oldestDate: null,
        newestDate: null,
        retentionDays: 0,
      }
    }
  }

  /**
   * 保存新闻到本地存储（滚动刷新）
   */
  async saveNewsWithRollingRefresh(
    articles: NewsArticle[],
    retentionDays: number = 7
  ): Promise<{ saved: number; deleted: number }> {
    let saved = 0

    // 保存新文章
    for (const article of articles) {
      try {
        await prisma.newsArticle.upsert({
          where: { id: article.id },
          update: {
            title: article.title,
            content: article.content,
            summary: article.summary,
            source: article.source,
            url: article.url,
            category: article.category,
            sentiment: article.sentiment,
            impact: article.impact,
          },
          create: {
            id: article.id,
            title: article.title,
            content: article.content,
            summary: article.summary,
            source: article.source,
            url: article.url,
            publishTime: article.publishTime,
            category: article.category,
            sentiment: article.sentiment,
            impact: article.impact,
            entities: article.entities ? JSON.stringify(article.entities) : null,
            sectors: article.sectors ? JSON.stringify(article.sectors) : null,
          },
        })
        saved++
      } catch (error) {
        console.error(`保存文章失败: ${article.id}`, error)
      }
    }

    // 清理过期文章
    const { deleted } = await this.cleanupExpiredNews(retentionDays)

    return { saved, deleted }
  }
}

  /**
   * 获取数据源列表
   */
  async getDataSources(): Promise<Array<{
    id: string
    name: string
    type: string
    driverType: string
    isActive: boolean
    lastFetchAt?: string
    lastFetchStatus?: string
    stats: {
      articlesCount: number
      logsCount: number
      jobsCount: number
    }
  }>> {
    try {
      const sources = await prisma.dataSource.findMany({
        orderBy: { createdAt: 'desc' },
        include: {
          _count: {
            select: {
              articles: true,
              logs: true,
              schedulerJobs: true
            }
          }
        }
      })

      return sources.map(s => ({
        id: s.id,
        name: s.name,
        type: s.type,
        driverType: s.driverType,
        isActive: s.isActive,
        lastFetchAt: s.lastFetchAt?.toISOString(),
        lastFetchStatus: s.lastFetchStatus || undefined,
        stats: {
          articlesCount: s._count.articles,
          logsCount: s._count.logs,
          jobsCount: s._count.schedulerJobs
        }
      }))
    } catch (error) {
      console.error('获取数据源列表失败:', error)
      return []
    }
  }

  /**
   * 获取采集日志
   */
  async getFetchLogs(params: {
    sourceId?: string
    status?: string
    limit?: number
    offset?: number
  }): Promise<{ total: number; items: Array<any> }> {
    try {
      const where: any = {}
      if (params.sourceId) where.sourceId = params.sourceId
      if (params.status) where.status = params.status

      const [total, logs] = await Promise.all([
        prisma.dataSourceLog.count({ where }),
        prisma.dataSourceLog.findMany({
          where,
          orderBy: { createdAt: 'desc' },
          skip: params.offset || 0,
          take: params.limit || 50,
          include: {
            source: {
              select: {
                name: true,
                type: true
              }
            }
          }
        })
      ])

      return {
        total,
        items: logs.map(log => ({
          id: log.id,
          sourceId: log.sourceId,
          sourceName: log.source.name,
          sourceType: log.source.type,
          status: log.status,
          message: log.message,
          fetchedCount: log.fetchedCount,
          processedCount: log.processedCount,
          failedCount: log.failedCount,
          duration: log.duration,
          errorDetail: log.errorDetail,
          createdAt: log.createdAt.toISOString()
        }))
      }
    } catch (error) {
      console.error('获取采集日志失败:', error)
      return { total: 0, items: [] }
    }
  }

  /**
   * 获取综合统计数据
   */
  async getDashboardStats(): Promise<{
    articles: {
      total: number
      today: number
      aiProcessed: number
      bySource: Array<{ source: string; count: number }>
    }
    dataSources: {
      total: number
      active: number
      lastFetch: string | null
    }
    sentiment: {
      bullish: number
      neutral: number
      bearish: number
    }
  }> {
    try {
      const today = new Date()
      today.setHours(0, 0, 0, 0)

      const [
        totalArticles,
        todayArticles,
        aiProcessedArticles,
        sourceStats,
        dataSources,
        sentimentStats
      ] = await Promise.all([
        prisma.newsArticle.count(),
        prisma.newsArticle.count({
          where: {
            createdAt: { gte: today }
          }
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
        prisma.dataSource.findMany({
          orderBy: { lastFetchAt: 'desc' },
          take: 1
        }),
        Promise.all([
          prisma.newsArticle.count({ where: { sentiment: { gt: 0.2 } } }),
          prisma.newsArticle.count({ where: { sentiment: { gte: -0.2, lte: 0.2 } } }),
          prisma.newsArticle.count({ where: { sentiment: { lt: -0.2 } } })
        ])
      ])

      const allSources = await prisma.dataSource.count()
      const activeSources = await prisma.dataSource.count({ where: { isActive: true } })

      return {
        articles: {
          total: totalArticles,
          today: todayArticles,
          aiProcessed: aiProcessedArticles,
          bySource: sourceStats.map(s => ({
            source: s.source,
            count: s._count
          }))
        },
        dataSources: {
          total: allSources,
          active: activeSources,
          lastFetch: dataSources[0]?.lastFetchAt?.toISOString() || null
        },
        sentiment: {
          bullish: sentimentStats[0],
          neutral: sentimentStats[1],
          bearish: sentimentStats[2]
        }
      }
    } catch (error) {
      console.error('获取统计数据失败:', error)
      return {
        articles: { total: 0, today: 0, aiProcessed: 0, bySource: [] },
        dataSources: { total: 0, active: 0, lastFetch: null },
        sentiment: { bullish: 0, neutral: 0, bearish: 0 }
      }
    }
  }

// 全局单例
export const eventService = new EventService()
