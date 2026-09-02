import { newsProvider } from '@/lib/providers'
import { prisma } from '@/lib/db'
import type { StepDefinition } from '../types'

/**
 * 步骤5: 获取相关新闻和热点
 */
export const fetchNewsStep: StepDefinition = {
  name: 'fetch-news',
  description: '获取相关新闻资讯',
  dependencies: ['fetch-etfs'],
  estimatedDuration: 10000,

  async execute(context) {
    const industryInfo = context.artifacts.get('industry-info') as any

    if (!industryInfo) {
      throw new Error('Missing industry info from previous step')
    }

    await context.updateProgress(0, 3, '正在获取相关新闻...')

    try {
      const localNews = await prisma.newsArticle.findMany({ where: { OR: [{ domainId: industryInfo.id }, { segmentCodes: { contains: industryInfo.code || industryInfo.name || '' } }] }, orderBy: { publishTime: 'desc' }, take: 50 })
      if (localNews.length > 0) {
        const newsArticles = localNews.map((article) => ({ id: article.id, title: article.title, content: article.content, summary: article.summary, source: article.source, url: article.url, publishTime: article.publishTime.toISOString(), sentiment: article.sentiment, impact: article.impact }))
        const sentimentSummary = { totalNews: newsArticles.length, positive: newsArticles.filter((n) => Number(n.sentiment || 0) > 0.3).length, neutral: newsArticles.filter((n) => Math.abs(Number(n.sentiment || 0)) <= 0.3).length, negative: newsArticles.filter((n) => Number(n.sentiment || 0) < -0.3).length, avgSentiment: newsArticles.reduce((sum, n) => sum + Number(n.sentiment || 0), 0) / newsArticles.length }
        await context.updateProgress(3, 3, `已读取本地数据库中的 ${newsArticles.length} 条资讯`)
        await context.saveArtifact('news-articles', newsArticles, 'DATA')
        await context.saveArtifact('news-trends', { hot_keywords: [], sentiment_summary: sentimentSummary }, 'DATA')
        await context.saveArtifact('news-sentiment', sentimentSummary, 'DATA')
        return
      }
      // 从FastAPI获取产业相关新闻
      const newsData = await newsProvider.fetch<any>(
        `/api/v1/industries/${industryInfo.id}/news?days=30&limit=50`,
        undefined,
        `industry-news:${industryInfo.id}:30d`,
        60000 // 1分钟缓存
      )

      const newsArticles = newsData?.articles || newsData?.news || newsData?.data || []

      await context.updateProgress(1, 3, `获取到 ${newsArticles.length} 条新闻`)

      // 提取热点趋势
      const trends = newsData?.trends || {
        hot_keywords: [],
        sentiment_summary: { positive: 0, neutral: 0, negative: 0 }
      }

      await context.updateProgress(2, 3, '分析新闻热点...')

      // 计算情感汇总
      const sentimentSummary = {
        totalNews: newsArticles.length,
        positive: newsArticles.filter((n: any) => n.sentiment > 0.3).length,
        neutral: newsArticles.filter((n: any) => Math.abs(n.sentiment || 0) <= 0.3).length,
        negative: newsArticles.filter((n: any) => (n.sentiment || 0) < -0.3).length,
        avgSentiment: newsArticles.reduce((sum: number, n: any) => sum + (n.sentiment || 0), 0) / (newsArticles.length || 1)
      }

      await context.updateProgress(3, 3, `已完成 ${newsArticles.length} 条资讯采集与情绪汇总`)

      // 保存新闻数据
      await context.saveArtifact('news-articles', newsArticles, 'DATA')
      await context.saveArtifact('news-trends', trends, 'DATA')
      await context.saveArtifact('news-sentiment', sentimentSummary, 'DATA')

    } catch (error) {
      console.warn('Failed to fetch news, using empty data:', error)
      // 新闻失败不阻断流程，使用空数据
      await context.saveArtifact('news-articles', [], 'DATA')
      await context.saveArtifact('news-trends', { hot_keywords: [], sentiment_summary: {} }, 'DATA')
      await context.saveArtifact('news-sentiment', { totalNews: 0, positive: 0, neutral: 0, negative: 0, avgSentiment: 0 }, 'DATA')
    }
  }
}
