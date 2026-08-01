import Anthropic from '@anthropic-ai/sdk'
import { tagCacheService } from '@/lib/services/tag-cache.service'
import { buildTagExtractionPrompt, type TagExtractionResult } from './prompts/news-tag-extraction'
import { prisma } from '@/lib/db/prisma'

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY || ''
})

export interface NewsAIAnalysisResult {
  // 现有字段
  category: string
  sentiment: number
  sentimentLabel: 'bullish' | 'neutral' | 'bearish'
  impact: number

  // 新增字段
  tags: Array<{
    tagId: string
    tagName: string
    tagCode: string
    level: number
    confidence: number
  }>

  relatedNodes: Array<{
    nodeId: string
    nodeName: string
    relevance: number
    reason: string
  }>
}

export class NewsAnalysisService {
  /**
   * 分析新闻（扩展版本，包含标签提取）
   */
  async analyzeNewsWithTags(
    title: string,
    content: string
  ): Promise<NewsAIAnalysisResult> {
    try {
      // 获取标签树和图谱节点
      const [tagTree, graphNodes] = await Promise.all([
        tagCacheService.getCachedTagTree(),
        prisma.graphNode.findMany({
          where: { level: { lte: 3 } },
          select: { id: true, name: true, type: true },
          take: 100
        })
      ])

      // 构建Prompt
      const prompt = buildTagExtractionPrompt(title, content, tagTree, graphNodes)

      // 调用Claude API
      const message = await anthropic.messages.create({
        model: 'claude-3-5-sonnet-20241022',
        max_tokens: 2000,
        messages: [{
          role: 'user',
          content: prompt
        }]
      })

      // 解析响应
      const responseText = message.content[0].type === 'text'
        ? message.content[0].text
        : ''

      const parsed: TagExtractionResult = JSON.parse(responseText)

      // 基础分析（情感、分类等）
      const basicAnalysis = this.extractBasicAnalysis(content)

      return {
        category: basicAnalysis.category,
        sentiment: basicAnalysis.sentiment,
        sentimentLabel: basicAnalysis.sentimentLabel,
        impact: basicAnalysis.impact,
        tags: parsed.tags,
        relatedNodes: parsed.relatedNodes
      }

    } catch (error) {
      console.error('Failed to analyze news with tags:', error)
      throw error
    }
  }

  /**
   * 基础分析（情感、分类）
   */
  private extractBasicAnalysis(content: string): {
    category: string
    sentiment: number
    sentimentLabel: 'bullish' | 'neutral' | 'bearish'
    impact: number
  } {
    // 简化版本：基于关键词判断
    const bullishKeywords = ['上涨', '增长', '突破', '利好', '盈利', '创新高', '超预期']
    const bearishKeywords = ['下跌', '下滑', '风险', '亏损', '利空', '暴跌', '预警']

    let sentiment = 0
    for (const word of bullishKeywords) {
      if (content.includes(word)) sentiment += 0.2
    }
    for (const word of bearishKeywords) {
      if (content.includes(word)) sentiment -= 0.2
    }

    sentiment = Math.max(-1, Math.min(1, sentiment))

    const sentimentLabel = sentiment > 0.3 ? 'bullish'
      : sentiment < -0.3 ? 'bearish'
      : 'neutral'

    return {
      category: '综合',
      sentiment,
      sentimentLabel,
      impact: 3
    }
  }
}

export const newsAnalysisService = new NewsAnalysisService()
