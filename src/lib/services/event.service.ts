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
    limit?: number
    offset?: number
  }): Promise<{ total: number; items: NewsArticle[] }> {
    const { category, limit = 20, offset = 0 } = params

    // 优先从本地数据库读取（定时采集的数据）
    try {
      const where: Record<string, unknown> = {}
      if (category) where.category = category

      const [total, articles] = await Promise.all([
        prisma.newsArticle.count({ where }),
        prisma.newsArticle.findMany({
          where,
          orderBy: { publishTime: 'desc' },
          skip: offset,
          take: limit,
        }),
      ])

      if (total > 0) {
        return {
          total,
          items: articles.map(a => ({
            id: a.id,
            title: a.title,
            content: a.content || '',
            summary: a.summary || undefined,
            source: a.source || '财联社',
            url: a.url || undefined,
            publishTime: a.publishTime?.toISOString() || new Date().toISOString(),
            category: a.category || 'market',
            sentiment: a.sentiment || undefined,
            impact: a.impact || undefined,
            entities: a.entities ? JSON.parse(a.entities as string) : undefined,
            sectors: a.sectors ? JSON.parse(a.sectors as string) : undefined,
          })),
        }
      }
    } catch {
      // 本地数据库无数据，降级到Python服务
    }

    // 降级：从Python数据服务获取
    const response = await fetch(
      `${DATA_SERVICE_URL}/api/news/feed?limit=${limit}&offset=${offset}${category ? `&category=${category}` : ''}`,
      { next: { revalidate: 300 }, signal: AbortSignal.timeout(30000) }
    )

    if (!response.ok) {
      throw new Error(`Python数据服务响应异常: ${response.status}`)
    }

    const data = await response.json()
    if (!data.success || !data.data) {
      throw new Error(data.error || '无法获取新闻数据')
    }

    return {
      total: data.data.total || 0,
      items: data.data.items || []
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

// 全局单例
export const eventService = new EventService()
