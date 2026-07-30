import Anthropic from '@anthropic-ai/sdk'
import { prisma } from '@/lib/db'

/**
 * 新闻图谱关联服务
 * Phase 2: 智能集成层 - 新闻自动标注
 */

interface NodeMatch {
  nodeId: string
  nodeName: string
  relevance: number // 0-1
  sentiment: 'positive' | 'neutral' | 'negative'
  impactType: 'direct' | 'indirect'
  keyMentions: string[]
  reasoning: string
}

interface NewsGraphLinkResult {
  newsId: string
  matches: NodeMatch[]
  tokensUsed: number
  durationMs: number
}

export class NewsGraphLinkerService {
  private client: Anthropic

  constructor(apiKey?: string) {
    const key = apiKey || process.env.ANTHROPIC_API_KEY
    if (!key) {
      throw new Error('ANTHROPIC_API_KEY environment variable is required')
    }
    const baseURL = process.env.ANTHROPIC_BASE_URL
    this.client = new Anthropic({
      apiKey: key,
      ...(baseURL && { baseURL })
    })
  }

  /**
   * 将新闻关联到知识图谱节点
   */
  async linkNewsToGraph(newsId: string): Promise<NewsGraphLinkResult> {
    const startTime = Date.now()

    // 1. 获取新闻内容
    const news = await prisma.newsArticle.findUnique({
      where: { id: newsId }
    })

    if (!news) {
      throw new Error(`News article not found: ${newsId}`)
    }

    // 2. 获取所有图谱节点（用于匹配）
    const nodes = await prisma.graphNode.findMany({
      select: {
        id: true,
        name: true,
        type: true,
        description: true,
        level: true
      }
    })

    if (nodes.length === 0) {
      console.warn('No graph nodes found, skipping linking')
      return {
        newsId,
        matches: [],
        tokensUsed: 0,
        durationMs: Date.now() - startTime
      }
    }

    // 3. 构建AI提示词
    const prompt = this.buildPrompt(news, nodes)

    // 4. 调用Claude分析
    const response = await this.client.messages.create({
      model: process.env.CLAUDE_MODEL || 'claude-opus-5',
      max_tokens: 3000,
      temperature: 0.3,
      messages: [{
        role: 'user',
        content: prompt
      }]
    })

    const durationMs = Date.now() - startTime
    const tokensUsed = (response.usage.input_tokens || 0) + (response.usage.output_tokens || 0)

    // 5. 解析结果
    const textContent = response.content.find(c => c.type === 'text')
    if (!textContent || textContent.type !== 'text') {
      throw new Error('No text content in Claude response')
    }

    let matches: NodeMatch[]
    try {
      let jsonText = textContent.text.trim()
      if (jsonText.startsWith('```json')) {
        jsonText = jsonText.replace(/^```json\s*\n/, '').replace(/\n```\s*$/, '')
      } else if (jsonText.startsWith('```')) {
        jsonText = jsonText.replace(/^```\s*\n/, '').replace(/\n```\s*$/, '')
      }
      jsonText = jsonText.replace(/,(\s*[}\]])/g, '$1')

      const parsed = JSON.parse(jsonText)
      matches = parsed.matches || []
    } catch (error) {
      console.error('Failed to parse Claude response:', textContent.text.substring(0, 500))
      throw new Error(`Failed to parse JSON: ${error}`)
    }

    // 6. 存储关联关系
    await this.saveLinks(newsId, matches)

    // 7. 更新节点统计
    await this.updateNodeStats(matches.map(m => m.nodeId))

    return {
      newsId,
      matches,
      tokensUsed,
      durationMs
    }
  }

  /**
   * 构建AI提示词
   */
  private buildPrompt(news: any, nodes: any[]): string {
    const nodesText = nodes
      .map(n => `- ${n.name} (${n.type}, level ${n.level}): ${n.description || '无描述'}`)
      .join('\n')

    return `你是一个AI投资分析专家，负责将新闻与产业链知识图谱关联。

**任务**：分析以下新闻，识别它涉及的产业链节点。

**新闻信息**：
标题：${news.title}
内容：${news.content.substring(0, 2000)}
发布时间：${news.publishTime}

**可用的知识图谱节点**：
${nodesText}

**输出要求**：
请以JSON格式返回匹配的节点，格式如下：
{
  "matches": [
    {
      "nodeId": "节点ID",
      "nodeName": "节点名称",
      "relevance": 0.9,  // 0-1，相关度
      "sentiment": "positive",  // positive/neutral/negative
      "impactType": "direct",  // direct/indirect
      "keyMentions": ["关键提及片段1", "关键提及片段2"],
      "reasoning": "匹配理由"
    }
  ]
}

**评分标准**：
- relevance: 新闻与节点的相关度
  - 0.9-1.0: 新闻主题直接关于该节点
  - 0.7-0.9: 新闻重点提及该节点
  - 0.5-0.7: 新闻部分涉及该节点
  - 0.3-0.5: 新闻间接相关
  - <0.3: 不建议关联

- sentiment: 新闻对该节点的情感倾向
  - positive: 利好消息（技术突破、订单增加、政策支持等）
  - negative: 利空消息（产能下降、订单取消、监管限制等）
  - neutral: 中性（行业动态、数据统计等）

- impactType: 影响类型
  - direct: 新闻直接关于该节点
  - indirect: 新闻关于相关节点，间接影响该节点

**注意**：
1. 只返回relevance >= 0.5的匹配
2. keyMentions应提取新闻中直接提及该节点的片段（不超过50字）
3. reasoning应简明扼要说明为什么匹配
4. 如果新闻与任何节点都不相关，返回空数组

请返回JSON格式的结果：`
  }

  /**
   * 保存关联关系到数据库
   */
  private async saveLinks(newsId: string, matches: NodeMatch[]): Promise<void> {
    // 删除旧的关联（如果重新分析）
    await prisma.newsGraphLink.deleteMany({
      where: { newsId }
    })

    // 创建新的关联
    if (matches.length > 0) {
      await prisma.newsGraphLink.createMany({
        data: matches.map(m => ({
          newsId,
          nodeId: m.nodeId,
          relevance: m.relevance,
          sentiment: m.sentiment,
          impactType: m.impactType,
          keyMentions: JSON.stringify(m.keyMentions)
        }))
      })
    }
  }

  /**
   * 更新节点统计数据
   */
  private async updateNodeStats(nodeIds: string[]): Promise<void> {
    const uniqueNodeIds = [...new Set(nodeIds)]

    const now = new Date()
    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000)

    for (const nodeId of uniqueNodeIds) {
      // 统计新闻数量
      const [count7d, count30d, sentimentData, latestNews] = await Promise.all([
        // 7天内新闻数
        prisma.newsGraphLink.count({
          where: {
            nodeId,
            createdAt: { gte: sevenDaysAgo }
          }
        }),
        // 30天内新闻数
        prisma.newsGraphLink.count({
          where: {
            nodeId,
            createdAt: { gte: thirtyDaysAgo }
          }
        }),
        // 情感统计
        prisma.newsGraphLink.findMany({
          where: {
            nodeId,
            createdAt: { gte: thirtyDaysAgo }
          },
          select: {
            sentiment: true,
            relevance: true
          }
        }),
        // 最新新闻时间
        prisma.newsGraphLink.findFirst({
          where: { nodeId },
          orderBy: { createdAt: 'desc' },
          select: { createdAt: true }
        })
      ])

      // 计算加权情感得分
      let sentimentScore: number | null = null
      if (sentimentData.length > 0) {
        const weightedSum = sentimentData.reduce((sum, item) => {
          const sentimentValue =
            item.sentiment === 'positive' ? 1 :
            item.sentiment === 'negative' ? -1 : 0
          return sum + sentimentValue * item.relevance
        }, 0)
        const totalWeight = sentimentData.reduce((sum, item) => sum + item.relevance, 0)
        sentimentScore = totalWeight > 0 ? weightedSum / totalWeight : 0
      }

      // 更新节点
      await prisma.graphNode.update({
        where: { id: nodeId },
        data: {
          newsCount7d: count7d,
          newsCount30d: count30d,
          sentimentScore,
          lastNewsAt: latestNews?.createdAt || null
        }
      })
    }
  }

  /**
   * 批量关联新闻（用于历史数据迁移）
   */
  async batchLinkNews(newsIds: string[], concurrency = 3): Promise<{
    total: number
    success: number
    failed: number
    totalTokens: number
    totalDuration: number
  }> {
    const results = {
      total: newsIds.length,
      success: 0,
      failed: 0,
      totalTokens: 0,
      totalDuration: 0
    }

    // 分批处理
    for (let i = 0; i < newsIds.length; i += concurrency) {
      const batch = newsIds.slice(i, i + concurrency)
      const promises = batch.map(async (newsId) => {
        try {
          const result = await this.linkNewsToGraph(newsId)
          results.success++
          results.totalTokens += result.tokensUsed
          results.totalDuration += result.durationMs
        } catch (error) {
          console.error(`Failed to link news ${newsId}:`, error)
          results.failed++
        }
      })

      await Promise.all(promises)
    }

    return results
  }
}

// 导出单例
export const newsGraphLinkerService = new NewsGraphLinkerService()
