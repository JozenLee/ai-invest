// 知识图谱市场数据增强服务
// 为图谱节点添加行业指数、资金流向、市场热度等投资参考数据

import prisma from '@/lib/db/prisma'
import type { GraphNode } from '@/types/graph'

export interface MarketDataEnhancement {
  // 行业指数数据
  indexPerformance?: {
    code: string
    name: string
    changePct1d?: number      // 1日涨跌幅
    changePct5d?: number      // 5日涨跌幅
    changePct30d?: number     // 30日涨跌幅
    volume?: number           // 成交量
    turnover?: number         // 换手率
    pe?: number               // 市盈率
    pb?: number               // 市净率
  }

  // ETF跟踪数据
  etfTracking?: {
    ticker: string
    name: string
    changePct1d?: number
    changePct5d?: number
    premium?: number          // 溢折价率
    totalAssets?: number      // 总资产规模（亿）
    inflow5d?: number         // 5日资金流入（亿）
  }[]

  // 资金流向
  capitalFlow?: {
    mainForceNet1d?: number   // 1日主力净流入（万）
    mainForceNet5d?: number   // 5日主力净流入（万）
    retailNet1d?: number      // 1日散户净流入（万）
    sentiment?: number        // 资金情绪指数 -100~+100
    consecutiveDays?: number  // 连续流入/流出天数
  }

  // 新闻热度
  newsHeat?: {
    count7d: number           // 7日新闻数
    count30d: number          // 30日新闻数
    sentimentScore?: number   // 情感得分 -1~+1
    sentimentLabel?: string   // bullish/neutral/bearish
    trending?: boolean        // 是否热点
    topKeywords?: string[]    // 高频关键词
  }

  // 市场认知指标
  marketCognition?: {
    institutionalAttention?: number  // 机构关注度 0-100
    retailAttention?: number         // 散户关注度 0-100
    analystCoverage?: number         // 分析师覆盖数
    searchIndex?: number             // 搜索热度指数
    socialMentions?: number          // 社交媒体提及数
  }

  // AI算力特定指标（针对AI算力硬件领域）
  aiComputeMetrics?: {
    gpuSupplyTightness?: number      // GPU供应紧张度 0-100
    computeRentalPrice?: number      // 算力租赁价格指数
    hbmSupplyStatus?: string         // HBM供应状态: tight/normal/loose
    datacenterCapex?: number         // 数据中心资本开支（亿美元）
    nvidiaCycle?: string             // NVIDIA产品周期: pre_launch/launch/mature/decline
    hyperscalerDemand?: string       // 云厂商需求: strong/moderate/weak
  }
}

export class GraphMarketDataService {
  /**
   * 为单个节点获取市场数据增强
   */
  async enhanceNode(node: GraphNode): Promise<GraphNode & { marketData?: MarketDataEnhancement }> {
    const marketData: MarketDataEnhancement = {}

    // 1. 获取指数表现数据
    if (node.type === 'index' || node.metadata) {
      const indexData = await this.getIndexPerformance(node)
      if (indexData) marketData.indexPerformance = indexData
    }

    // 2. 获取ETF跟踪数据
    const etfData = await this.getETFTracking(node)
    if (etfData && etfData.length > 0) marketData.etfTracking = etfData

    // 3. 获取资金流向
    const capitalFlow = await this.getCapitalFlow(node)
    if (capitalFlow) marketData.capitalFlow = capitalFlow

    // 4. 获取新闻热度
    const newsHeat = await this.getNewsHeat(node)
    if (newsHeat) marketData.newsHeat = newsHeat

    // 5. 获取市场认知指标
    const marketCognition = await this.getMarketCognition(node)
    if (marketCognition) marketData.marketCognition = marketCognition

    // 6. AI算力特定指标（仅对相关节点）
    if (this.isAIComputeNode(node)) {
      const aiMetrics = await this.getAIComputeMetrics(node)
      if (aiMetrics) marketData.aiComputeMetrics = aiMetrics
    }

    return {
      ...node,
      marketData
    }
  }

  /**
   * 批量增强多个节点
   */
  async enhanceNodes(nodes: GraphNode[]): Promise<Array<GraphNode & { marketData?: MarketDataEnhancement }>> {
    return Promise.all(nodes.map(node => this.enhanceNode(node)))
  }

  /**
   * 获取指数表现数据
   */
  private async getIndexPerformance(node: GraphNode) {
    try {
      // 从metadata中提取指数代码
      let indexCode: string | undefined
      if (node.type === 'index') {
        // 指数节点直接从名称映射
        const indexMapping: Record<string, string> = {
          '沪深300': '000300',
          '科创50': '000688',
          '中证半导体': '931865',
          '中证人工智能': '930713',
          '中证通信设备': '931160',
        }
        indexCode = indexMapping[node.name]
      } else if (node.metadata) {
        // 其他节点从metadata提取
        const metadata = typeof node.metadata === 'string' ? JSON.parse(node.metadata) : node.metadata
        indexCode = metadata.relatedIndex
      }

      if (!indexCode) return null

      // 获取最近30日数据
      const records = await prisma.indexDaily.findMany({
        where: { code: indexCode },
        orderBy: { date: 'desc' },
        take: 30
      })

      if (records.length === 0) return null

      const latest = records[0]
      const day5 = records[4] // 5日前
      const day30 = records[Math.min(29, records.length - 1)] // 30日前

      return {
        code: indexCode,
        name: latest.name,
        changePct1d: latest.changePct ?? undefined,
        changePct5d: day5 ? ((latest.close - day5.close) / day5.close) * 100 : undefined,
        changePct30d: day30 ? ((latest.close - day30.close) / day30.close) * 100 : undefined,
        volume: Number(latest.volume),
      }
    } catch (error) {
      console.error('获取指数表现失败:', error)
      return null
    }
  }

  /**
   * 获取ETF跟踪数据
   */
  private async getETFTracking(node: GraphNode) {
    try {
      // 从metadata中提取ETF列表
      let etfTickers: string[] = []
      if (node.metadata) {
        const metadata = typeof node.metadata === 'string' ? JSON.parse(node.metadata) : node.metadata
        if (metadata.trackingETFs) {
          etfTickers = metadata.trackingETFs.map((etf: any) => etf.ticker)
        }
      }

      if (etfTickers.length === 0) return []

      // 获取ETF数据
      const etfData = await Promise.all(
        etfTickers.map(async (ticker) => {
          const records = await prisma.eTFDaily.findMany({
            where: { ticker },
            orderBy: { date: 'desc' },
            take: 30
          })

          if (records.length === 0) return null

          const latest = records[0]
          const day5 = records[4]

          // 计算5日资金流入（简化：用成交额变化估算）
          const inflow5d = records.slice(0, 5).reduce((sum, r) => sum + (r.amount || 0), 0) / 100000000 // 转为亿

          return {
            ticker,
            name: latest.name,
            changePct1d: latest.close && records[1]?.close
              ? ((latest.close - records[1].close) / records[1].close) * 100
              : undefined,
            changePct5d: day5 ? ((latest.close - day5.close) / day5.close) * 100 : undefined,
            premium: latest.premium ?? undefined,
            totalAssets: latest.shares ? Number(latest.shares) * latest.close / 10000 : undefined, // 估算总资产（亿）
            inflow5d,
          }
        })
      )

      return etfData.filter((d): d is NonNullable<typeof d> => d !== null)
    } catch (error) {
      console.error('获取ETF跟踪数据失败:', error)
      return []
    }
  }

  /**
   * 获取资金流向数据
   */
  private async getCapitalFlow(node: GraphNode) {
    try {
      // 映射节点到板块名称
      const sectorName = this.mapNodeToSector(node)
      if (!sectorName) return null

      const flows = await prisma.sectorCapitalFlow.findMany({
        where: { sector: sectorName },
        orderBy: { date: 'desc' },
        take: 5
      })

      if (flows.length === 0) return null

      const latest = flows[0]
      const mainForceNet5d = flows.reduce((sum, f) => sum + f.mainForceNet, 0)
      const retailNet1d = latest.retailNet

      return {
        mainForceNet1d: latest.mainForceNet,
        mainForceNet5d,
        retailNet1d,
        sentiment: this.calculateSentiment(flows),
        consecutiveDays: latest.consecutiveDays ?? undefined,
      }
    } catch (error) {
      console.error('获取资金流向失败:', error)
      return null
    }
  }

  /**
   * 获取新闻热度
   */
  private async getNewsHeat(node: GraphNode) {
    try {
      const count7d = node.newsCount7d || 0
      const count30d = node.newsCount30d || 0

      // 获取关联新闻
      const recentNews = await prisma.newsGraphLink.findMany({
        where: {
          nodeId: node.id,
          createdAt: { gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) }
        },
        include: { news: true },
        orderBy: { createdAt: 'desc' },
        take: 50
      })

      // 计算情感得分
      const sentiments = recentNews
        .map(link => link.news.sentiment)
        .filter((s): s is number => s !== null)

      const sentimentScore = sentiments.length > 0
        ? sentiments.reduce((sum, s) => sum + s, 0) / sentiments.length
        : undefined

      // 判断情感标签
      let sentimentLabel: string | undefined
      if (sentimentScore !== undefined) {
        if (sentimentScore > 0.3) sentimentLabel = 'bullish'
        else if (sentimentScore < -0.3) sentimentLabel = 'bearish'
        else sentimentLabel = 'neutral'
      }

      // 提取高频关键词
      const topKeywords = await this.extractTopKeywords(recentNews.map(l => l.news))

      // 判断是否热点（7日新闻数 > 10 且增长率 > 50%）
      const trending = count7d > 10 && count30d > 0 && (count7d / (count30d / 30 * 7)) > 1.5

      return {
        count7d,
        count30d,
        sentimentScore,
        sentimentLabel,
        trending,
        topKeywords,
      }
    } catch (error) {
      console.error('获取新闻热度失败:', error)
      return null
    }
  }

  /**
   * 获取市场认知指标
   */
  private async getMarketCognition(node: GraphNode) {
    try {
      // 这里是模拟数据，实际应该从真实数据源获取
      // 机构关注度：基于新闻数和情感
      const institutionalAttention = Math.min(100, (node.newsCount30d || 0) * 2)

      // 散户关注度：基于社交媒体数据（暂时用新闻数估算）
      const retailAttention = Math.min(100, (node.newsCount7d || 0) * 5)

      return {
        institutionalAttention,
        retailAttention,
        analystCoverage: undefined, // 需要从第三方数据源获取
        searchIndex: undefined,     // 需要集成搜索引擎API
        socialMentions: undefined,  // 需要集成社交媒体API
      }
    } catch (error) {
      console.error('获取市场认知指标失败:', error)
      return null
    }
  }

  /**
   * 获取AI算力特定指标
   */
  private async getAIComputeMetrics(node: GraphNode) {
    try {
      // 这里提供AI算力领域的特定指标
      // 实际应该从行业报告、API、爬虫等数据源获取

      // 根据节点类型返回不同的指标
      const metrics: any = {}

      // GPU供应紧张度（基于新闻情感和关键词）
      if (node.name.includes('GPU') || node.name.includes('芯片') || node.type === 'chip_design') {
        const recentNews = await prisma.newsGraphLink.findMany({
          where: {
            nodeId: node.id,
            createdAt: { gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) }
          },
          include: { news: true },
          take: 100
        })

        // 分析新闻内容判断供应紧张度
        const supplyKeywords = ['缺货', '供不应求', '紧缺', '涨价', '抢购']
        const supplyMentions = recentNews.filter(link =>
          supplyKeywords.some(kw => link.news.content.includes(kw) || link.news.title.includes(kw))
        ).length

        metrics.gpuSupplyTightness = Math.min(100, supplyMentions * 10)
        metrics.nvidiaCycle = this.inferNvidiaCycle(recentNews.map(l => l.news))
      }

      // HBM供应状态
      if (node.name.includes('HBM') || node.name.includes('存储') || node.type === 'memory') {
        metrics.hbmSupplyStatus = 'tight' // 当前HBM普遍紧张
      }

      // 数据中心资本开支
      if (node.name.includes('数据中心') || node.type === 'data_center' || node.type === 'server') {
        // 从相关新闻中提取capex数据
        metrics.datacenterCapex = undefined // 需要NLP提取
        metrics.hyperscalerDemand = 'strong' // 当前云厂商需求强劲
      }

      return Object.keys(metrics).length > 0 ? metrics : null
    } catch (error) {
      console.error('获取AI算力指标失败:', error)
      return null
    }
  }

  // ==================== 辅助方法 ====================

  /**
   * 判断是否为AI算力相关节点
   */
  private isAIComputeNode(node: GraphNode): boolean {
    const aiComputeTypes = [
      'chip_design', 'memory', 'server', 'cooling', 'data_center',
      'networking', 'optical_module', 'cpo', 'pcb', 'power'
    ]
    return aiComputeTypes.includes(node.type) ||
           node.name.includes('AI') ||
           node.name.includes('算力') ||
           node.name.includes('GPU')
  }

  /**
   * 映射节点到板块名称（扩展版）
   */
  private mapNodeToSector(node: GraphNode): string | null {
    // 基础类型映射表
    const typeMapping: Record<string, string> = {
      // 原有映射
      'chip_design': '芯片',
      'memory': '存储芯片',
      'server': '服务器',
      'cooling': '散热',
      'data_center': '数据中心',
      'optical_module': '光模块',
      'cpo': '光通信',
      'networking': '通信设备',

      // 新增映射 - AI 相关
      'ai_index': '人工智能',
      'ai_l1': '人工智能',
      'ai_l2': '人工智能',

      // 新增映射 - 生物医药
      'biotech_index': '医药生物',
      'biotech_l1': '医药生物',
      'biotech_l2': '医药生物',

      // 新增映射 - 消费电子
      'ce_index': '电子',
      'ce_l1': '电子',
      'ce_l2': '电子',

      // 新增映射 - 消费
      'consumer_index': '消费',
      'consumer_l1': '消费',
      'consumer_l2': '消费',

      // 新增映射 - 国防军工
      'defense_index': '国防军工',
      'defense_l1': '国防军工',
      'defense_l2': '国防军工',

      // 新增映射 - 数字经济
      'digital_index': '通信',
      'digital_l1': '通信',
      'digital_l2': '通信',

      // 新增映射 - 新能源
      'energy_index': '电力设备',
      'energy_l1': '电力设备',
      'energy_l2': '电力设备',
      'nev_index': '汽车',
      'nev_l1': '汽车',
      'nev_l2': '汽车',
      'nev_l3': '汽车',

      // 新增映射 - 材料
      'materials_index': '基础化工',
      'materials_l1': '基础化工',
      'materials_l2': '基础化工',

      // 新增映射 - 机器人
      'robotics_index': '机械设备',
      'robotics_l1': '机械设备',
      'robotics_l2': '机械设备',

      // 通用映射
      'sector_l1': '芯片',
      'industry_l2': '电子',
      'sub_sector': '电子',
      'subsector_l2': '电子',
    }

    // 1. 先尝试精确类型匹配
    if (typeMapping[node.type]) {
      return typeMapping[node.type]
    }

    // 2. 基于名称的模糊匹配
    const nameMapping: Array<[RegExp, string]> = [
      [/芯片|半导体|GPU|CPU|AI芯片|ASIC|FPGA/, '芯片'],
      [/存储|内存|HBM|闪存|SSD/, '存储芯片'],
      [/服务器|算力|IDC|云计算/, '服务器'],
      [/散热|液冷|风冷|热管/, '散热'],
      [/数据中心|机房/, '数据中心'],
      [/光模块|光芯片|激光器/, '光模块'],
      [/CPO|硅光|光电/, '光通信'],
      [/通信设备|基站|路由器|交换机/, '通信设备'],
      [/人工智能|AI|机器学习|深度学习/, '人工智能'],
      [/医药|生物|制药|医疗/, '医药生物'],
      [/消费电子|手机|电脑|平板/, '电子'],
      [/新能源|电动车|锂电|光伏/, '电力设备'],
      [/汽车|车载|智能驾驶/, '汽车'],
      [/机器人|自动化|工业机器人/, '机械设备'],
      [/国防|军工|航空|航天/, '国防军工'],
      [/化工|材料|新材料/, '基础化工'],
    ]

    for (const [pattern, sector] of nameMapping) {
      if (pattern.test(node.name)) {
        return sector
      }
    }

    // 3. 如果有 metadata.sector 字段，优先使用
    if (node.metadata) {
      const metadata = typeof node.metadata === 'string'
        ? JSON.parse(node.metadata)
        : node.metadata
      if (metadata.sector) {
        return metadata.sector
      }
    }

    return null
  }

  /**
   * 计算资金情绪
   */
  private calculateSentiment(flows: any[]): number {
    if (flows.length === 0) return 0

    // 基于主力资金流向和涨跌幅计算情绪
    const avgMainForce = flows.reduce((sum, f) => sum + f.mainForceNet, 0) / flows.length
    const avgChangePct = flows.reduce((sum, f) => sum + (f.changePct || 0), 0) / flows.length

    // 归一化到 -100 ~ +100
    const sentiment = (avgMainForce / 100000 + avgChangePct * 10)
    return Math.max(-100, Math.min(100, sentiment))
  }

  /**
   * 提取高频关键词
   */
  private async extractTopKeywords(articles: any[]): Promise<string[]> {
    try {
      // 简化版：从keywords字段提取
      const allKeywords: string[] = []

      for (const article of articles) {
        if (article.keywords) {
          const keywords = typeof article.keywords === 'string'
            ? JSON.parse(article.keywords)
            : article.keywords
          allKeywords.push(...keywords)
        }
      }

      // 统计词频
      const freq = allKeywords.reduce((acc, kw) => {
        acc[kw] = (acc[kw] || 0) + 1
        return acc
      }, {} as Record<string, number>)

      // 返回top 5
      return Object.entries(freq)
        .sort(([, a], [, b]) => b - a)
        .slice(0, 5)
        .map(([kw]) => kw)
    } catch (error) {
      return []
    }
  }

  /**
   * 推断NVIDIA产品周期
   */
  private inferNvidiaCycle(articles: any[]): string {
    const keywords = {
      pre_launch: ['即将发布', '预计推出', '曝光', '爆料'],
      launch: ['发布', '上市', '开售', '首发'],
      mature: ['稳定供应', '量产', '出货'],
      decline: ['降价', '清仓', '停产', '替代']
    }

    const scores = {
      pre_launch: 0,
      launch: 0,
      mature: 0,
      decline: 0
    }

    for (const article of articles.slice(0, 20)) { // 只看最近20条
      const text = article.title + ' ' + article.content
      for (const [phase, kws] of Object.entries(keywords)) {
        scores[phase as keyof typeof scores] += kws.filter(kw => text.includes(kw)).length
      }
    }

    // 返回得分最高的阶段
    const maxPhase = Object.entries(scores).reduce((max, [phase, score]) =>
      score > max[1] ? [phase, score] : max
    , ['mature', 0])[0]

    return maxPhase
  }
}

// 全局单例
export const graphMarketDataService = new GraphMarketDataService()
