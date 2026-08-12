// 事件分析服务
// 提供新闻采集、事件分析、趋势聚合等功能

import { aiAnalysisService, EventAnalysisRequest, EventAnalysisResponse } from '@/lib/services/ai-analysis.service'
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
    domainIds?: string[]
    sourceIds?: string[]
    keyword?: string
    sentiments?: string[]
    sortBy?: string
    limit?: number
    offset?: number
    industryId?: string
    segmentCodes?: string[]
  }): Promise<{ total: number; items: NewsArticle[]; source: 'local' | 'remote' }> {
    const {
      category,
      categoryIds,
      domainIds,
      sourceIds,
      keyword,
      sentiments,
      sortBy = 'publishTime',
      limit = 20,
      offset = 0,
      industryId,
      segmentCodes,
    } = params

    // 优先从本地数据库读取（定时采集的数据）
    try {
      const where: any = {}

      // 产业/Segment筛选（新增）
      if (industryId) {
        try {
          let segmentsToQuery = segmentCodes || []

          // 如果只选择了产业，没有选择Segment，则获取该产业下所有Segment
          if (segmentsToQuery.length === 0) {
            const segmentsResponse = await fetch(
              `${DATA_SERVICE_URL}/api/v1/industry-graph/${industryId}/segments`
            )

            if (segmentsResponse.ok) {
              const segmentsData = await segmentsResponse.json()
              if (segmentsData.success && segmentsData.data?.segments) {
                segmentsToQuery = segmentsData.data.segments.map((s: any) => s.segment_code)
              }
            }
          }

          // 直接使用segmentCodes字段筛选（JSON数组字段）
          // SQLite不支持JSON函数，所以使用字符串匹配
          if (segmentsToQuery.length > 0) {
            where.OR = segmentsToQuery.map(segmentCode => ({
              segmentCodes: { contains: `"${segmentCode}"` }
            }))
          } else {
            // 没有segment，返回空结果
            return { total: 0, items: [], source: 'local' }
          }
        } catch (error) {
          console.error('获取Segment筛选失败:', error)
          // 继续执行，不阻塞其他筛选条件
        }
      }

      // 分类筛选
      if (categoryIds && categoryIds.length > 0) {
        where.categoryId = { in: categoryIds }
      } else if (category) {
        where.category = category
      }

      // 领域筛选（支持多选）- 基于domainIds字段（JSON数组）
      if (domainIds && domainIds.length > 0) {
        // domainIds是JSON字符串，需要匹配数组中的任一元素
        // SQLite不支持JSON函数，所以使用字符串匹配
        where.OR = domainIds.map(domainId => ({
          domainIds: { contains: `"${domainId}"` }
        }))
      }

      // 数据源筛选（支持多选）
      if (sourceIds && sourceIds.length > 0) {
        where.sourceId = { in: sourceIds }
      }

      // 情感筛选（支持多选）
      if (sentiments && sentiments.length > 0) {
        const sentimentConditions = sentiments.map(sentiment => {
          switch (sentiment) {
            case 'bullish':
              return { sentiment: { gt: 0.2 } }
            case 'bearish':
              return { sentiment: { lt: -0.2 } }
            case 'neutral':
              return { sentiment: { gte: -0.2, lte: 0.2 } }
            default:
              return null
          }
        }).filter(Boolean)

        if (sentimentConditions.length > 0) {
          where.OR = sentimentConditions
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
            tags: {
              include: {
                tag: true,
              },
              orderBy: {
                confidence: 'desc',
              },
            },
          },
        }),
      ])

      if (total > 0) {
        console.log(`✅ 从本地数据库获取新闻: ${articles.length}/${total} 条`)

        // 收集所有新闻的 segmentCodes
        const allSegmentCodes = new Set<string>()
        articles.forEach(article => {
          if (article.segmentCodes) {
            try {
              const codes = JSON.parse(article.segmentCodes as string)
              if (Array.isArray(codes)) {
                codes.forEach(code => allSegmentCodes.add(code))
              }
            } catch (e) {
              // segmentCodes 解析失败，跳过
            }
          }
        })

        console.log(`📊 收集到 ${allSegmentCodes.size} 个不同的 segmentCodes`)
        if (allSegmentCodes.size > 0) {
          console.log(`📊 segmentCodes: ${Array.from(allSegmentCodes).join(', ')}`)
        }

        // 构建 segmentCode -> 产业信息的映射（从知识图谱API获取）
        const segmentToIndustryMap: Record<string, {
          industry_code: string
          industry_name: string
          segment_code: string
          segment_name: string
        }> = {}

        if (allSegmentCodes.size > 0) {
          try {
            console.log(`🔍 开始构建 Segment 映射...`)
            // 获取所有产业列表
            const industriesResp = await fetch(`${DATA_SERVICE_URL}/api/v1/industries`)
            if (industriesResp.ok) {
              const industries = await industriesResp.json()
              console.log(`✅ 获取到 ${industries.length} 个产业`)

              // 遍历每个产业，获取其segments
              for (const industry of industries) {
                try {
                  const graphResp = await fetch(`${DATA_SERVICE_URL}/api/v1/industries/${industry.id}/graph`)
                  if (graphResp.ok) {
                    const graphData = await graphResp.json()
                    const stages = graphData.stages || []

                    for (const stage of stages) {
                      for (const segment of stage.segments || []) {
                        if (allSegmentCodes.has(segment.code)) {
                          segmentToIndustryMap[segment.code] = {
                            industry_code: industry.code,
                            industry_name: industry.name,
                            segment_code: segment.code,
                            segment_name: segment.name
                          }
                        }
                      }
                    }
                  }
                } catch (e) {
                  console.error(`获取产业 ${industry.name} 图谱失败:`, e)
                }
              }
              console.log(`✅ 构建映射完成，匹配到 ${Object.keys(segmentToIndustryMap).length} 个 segments`)
            } else {
              console.error(`❌ 获取产业列表失败: ${industriesResp.status}`)
            }
          } catch (error) {
            console.error('构建Segment映射失败:', error)
          }
        }

        return {
          total,
          source: 'local',
          items: articles.map((a) => {
            // 解析domainIds（JSON数组）
            let domainIds: string[] = []
            if (a.domainIds) {
              try {
                domainIds = JSON.parse(a.domainIds as string)
              } catch (e) {
                console.error('解析domainIds失败:', e)
              }
            }

            // 解析segmentCodes（JSON数组）
            let segmentCodes: string[] = []
            if (a.segmentCodes) {
              try {
                segmentCodes = JSON.parse(a.segmentCodes as string)
              } catch (e) {
                console.error('解析segmentCodes失败:', e)
              }
            }

            // 从 segmentCodes 构建产业细分信息
            const industrySegments: Array<{
              industry_code: string
              industry_name: string
              segment_code: string
              segment_name: string
            }> = []

            // 去重：使用Set来避免重复的Segment
            const segmentKeys = new Set<string>()

            segmentCodes.forEach(segmentCode => {
              const segmentInfo = segmentToIndustryMap[segmentCode]
              if (segmentInfo) {
                const key = `${segmentInfo.industry_code}-${segmentInfo.segment_code}`
                if (!segmentKeys.has(key)) {
                  segmentKeys.add(key)
                  industrySegments.push(segmentInfo)
                }
              }
            })

            return {
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
              domainIds: domainIds,
              domainName: a.domain?.name || undefined,
              sentiment: a.sentiment || undefined,
              sentimentLabel: a.sentimentLabel || undefined,
              impact: a.impact || undefined,
              entities: a.entities ? JSON.parse(a.entities as string) : undefined,
              sectors: a.sectors ? JSON.parse(a.sectors as string) : undefined,
              keywords: a.keywords ? JSON.parse(a.keywords as string) : undefined,
              aiProcessed: a.aiProcessed || false,
              tags: a.tags || [],
              segmentCodes: segmentCodes, // 新增：产业细分领域代码列表
              industrySegments: industrySegments, // 新增：完整的产业细分信息
            }
          }),
        }
      }

      // 如果使用了产业筛选但本地无结果，直接返回空，不降级
      // 因为产业筛选依赖本地Tag表，Python服务无法处理
      if (industryId) {
        return { total: 0, items: [], source: 'local' }
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

    const analysis = await aiAnalysisService.analyzeEvent(request)

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

  /**
   * 将 AI 分类结果映射到 NewsCategory
   * @param aiCategory AI 返回的分类 code (policy/earnings/product/partnership/supply/tech/regulation/market)
   * @returns 数据库中的 NewsCategory ID，如果找不到则返回 null
   */
  async mapAICategoryToDatabase(aiCategory: string): Promise<string | null> {
    try {
      // 尝试通过 code 直接匹配
      const category = await prisma.newsCategory.findFirst({
        where: {
          code: aiCategory,
          isActive: true,
        },
      });

      if (category) {
        return category.id;
      }

      // 如果没有找到，尝试模糊匹配名称
      const categories = await prisma.newsCategory.findMany({
        where: {
          isActive: true,
        },
      });

      // 分类映射表 - 支持22类完整映射
      const categoryMap: Record<string, string[]> = {
        // 科技类
        ai: ['人工智能', 'AI', '大模型'],
        chip: ['芯片', '半导体', 'GPU'],
        internet: ['互联网', '电商', '社交'],
        product: ['产品', '新品', '发布'],
        breakthrough: ['技术', '研发', '创新', '突破'],

        // 财经类
        earnings: ['业绩', '财报', '盈利', '营收'],
        merger: ['合作', '并购', '收购', '战略'],
        capital: ['资本', '上市', 'IPO', '融资'],
        macro: ['宏观', '经济', 'GDP', '央行'],

        // 政策类
        policy: ['政策', '规划', '补贴'],
        regulation: ['监管', '制裁', '管制'],
        government: ['政府', '国务院', '部委'],

        // 社会类
        event: ['事件', '突发', '事故'],
        consume: ['消费', '零售', '生活'],

        // 国际类
        geopolitics: ['地缘', '政治', '外交'],
        global_market: ['市场', '全球', '海外'],
        trade: ['贸易', '进出口', '关税'],

        // 产业类
        supply: ['供应', '供应链', '订单'],
        capacity: ['产能', '扩产', '建厂'],
        competition: ['竞争', '格局', '份额'],
        new_energy: ['新能源', '光伏', '电动'],
        medical: ['医药', '医疗', '创新药'],
      };

      const keywords = categoryMap[aiCategory] || [];
      for (const cat of categories) {
        if (keywords.some(keyword => cat.name.includes(keyword))) {
          return cat.id;
        }
      }

      return null;
    } catch (error) {
      console.error('映射 AI 分类失败:', error);
      return null;
    }
  }

  /**
   * 将 AI 领域关键词映射到 Domain
   * @param keywords AI 提取的关键词数组
   * @returns 匹配的 Domain ID 数组
   */
  async mapAIKeywordsToDomains(keywords: string[]): Promise<string[]> {
    try {
      const domains = await prisma.domain.findMany({
        where: {
          isActive: true,
        },
      });

      const matchedDomainIds = new Set<string>();

      for (const domain of domains) {
        const domainKeywords = domain.keywords ? JSON.parse(domain.keywords) : [];

        // 检查是否有关键词匹配
        const hasMatch = keywords.some(keyword =>
          domainKeywords.some((dk: string) =>
            keyword.includes(dk) || dk.includes(keyword)
          )
        );

        if (hasMatch) {
          matchedDomainIds.add(domain.id);
        }
      }

      return Array.from(matchedDomainIds);
    } catch (error) {
      console.error('映射 AI 关键词到领域失败:', error);
      return [];
    }
  }
}

// 全局单例
export const eventService = new EventService()
