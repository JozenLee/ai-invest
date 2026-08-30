// ETF/指数智能匹配服务
// 结合关键词过滤和AI分析，为图谱节点匹配相关的ETF和指数

import { aiClient, type AIClient } from '@/lib/ai/ai-factory'
import { prisma } from '@/lib/db'
import { etfIndexFetcher, type ETFItem, type IndexItem } from './etf-index-fetcher.service'
import { keywordMatcher } from '@/lib/utils/keyword-matcher'
import { buildMatchingPrompt } from '@/lib/prompts/etf-index-matching'

export interface MatchOptions {
  matchETF?: boolean
  matchIndex?: boolean
  topN?: number
  minRelevance?: number
  forceRefresh?: boolean
}

export interface MatchResult {
  etfs: Array<{
    code: string
    name: string
    relevance: number
    reasoning: string
  }>
  indices: Array<{
    code: string
    name: string
    relevance: number
    reasoning: string
  }>
}

export interface NodeMatchResult {
  nodeId: string
  nodeName: string
  etfCount: number
  indexCount: number
  success: boolean
  error?: string
  etfs?: Array<{
    code: string
    name: string
    relevance: number
    reasoning: string
  }>
  indices?: Array<{
    code: string
    name: string
    relevance: number
    reasoning: string
  }>
}

class ETFIndexMatcherService {
  private aiClient: AIClient
  private processingNodes: Set<string> = new Set()

  constructor() {
    this.aiClient = aiClient
  }

  /**
   * 为单个节点匹配ETF和指数（通过名称，用于Neo4j节点）
   */
  async matchNodeByName(
    nodeId: string,
    nodeName: string,
    options: MatchOptions = {}
  ): Promise<NodeMatchResult> {
    // 防止重复处理
    if (this.processingNodes.has(nodeId)) {
      return {
        nodeId,
        nodeName,
        etfCount: 0,
        indexCount: 0,
        success: false,
        error: '节点正在处理中',
      }
    }

    this.processingNodes.add(nodeId)

    try {
      const {
        matchETF = true,
        matchIndex = true,
        topN = 5,
        minRelevance = 0.6,
        forceRefresh = false,
      } = options

      // 获取ETF和指数列表
      const [etfList, indexList] = await Promise.all([
        matchETF ? etfIndexFetcher.getETFList({ limit: 500, forceRefresh }) : Promise.resolve([]),
        matchIndex ? etfIndexFetcher.getIndexList({ forceRefresh }) : Promise.resolve([]),
      ])

      console.log(`[ETF匹配] 节点: ${nodeName}`)
      console.log(`[ETF匹配] 获取到 ${etfList.length} 个ETF, ${indexList.length} 个指数`)
      if (etfList.length > 0) {
        console.log(`[ETF匹配] ETF样例:`, etfList.slice(0, 5).map(e => `${e.ticker}-${e.name}`))
      }

      // 关键词初筛
      const etfCandidates = matchETF
        ? keywordMatcher.filterByKeywords(nodeName, etfList, {
            minScore: 0.2,
            maxResults: 20,
          })
        : []

      const indexCandidates = matchIndex
        ? keywordMatcher.filterByKeywords(nodeName, indexList, {
            minScore: 0.2,
            maxResults: 20,
          })
        : []

      console.log(`[ETF匹配] 关键词初筛结果: ${etfCandidates.length} 个ETF候选, ${indexCandidates.length} 个指数候选`)
      if (etfCandidates.length > 0) {
        console.log(`[ETF匹配] ETF候选:`, etfCandidates.slice(0, 3).map(e => `${e.ticker}-${e.name} (score=${e.matchScore.toFixed(2)})`))
      }

      // 如果关键词筛选后没有候选项，直接返回
      if (etfCandidates.length === 0 && indexCandidates.length === 0) {
        console.log(`[ETF匹配] 节点 ${nodeName} 没有匹配的候选项`)
        return {
          nodeId,
          nodeName,
          etfCount: 0,
          indexCount: 0,
          success: true,
        }
      }

      // AI精准匹配
      const matchResult = await this.aiMatch({
        nodeName,
        nodeType: 'segment',
        nodeDescription: undefined,
        industryContext: undefined,
        etfCandidates: etfCandidates.map(e => ({ ticker: e.ticker, name: e.name })),
        indexCandidates: indexCandidates.map(i => ({ code: i.code, name: i.name })),
      })

      // 过滤结果
      const filteredETFs = matchResult.etfs
        .filter(e => e.relevance >= minRelevance)
        .slice(0, topN)

      const filteredIndices = matchResult.indices
        .filter(i => i.relevance >= minRelevance)
        .slice(0, topN)

      // 保存匹配结果到Neo4j
      try {
        const DATA_SERVICE_URL = process.env.DATA_SERVICE_URL || 'http://localhost:8000'
        const saveResponse = await fetch(
          `${DATA_SERVICE_URL}/api/v1/industry-graph/segments/${nodeId}/match-results`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              segment_id: nodeId,
              etfs: filteredETFs,
              indices: filteredIndices,
            }),
          }
        )

        if (!saveResponse.ok) {
          console.warn(`保存匹配结果到Neo4j失败: ${saveResponse.status}`)
        } else {
          console.log(`节点 ${nodeName} 匹配结果已保存: ${filteredETFs.length} ETF, ${filteredIndices.length} 指数`)
        }
      } catch (saveError) {
        console.warn('保存匹配结果到Neo4j出错:', saveError)
      }

      return {
        nodeId,
        nodeName,
        etfCount: filteredETFs.length,
        indexCount: filteredIndices.length,
        success: true,
        etfs: filteredETFs,
        indices: filteredIndices,
      }
    } catch (error) {
      console.error(`匹配节点 ${nodeId} 失败:`, error)
      return {
        nodeId,
        nodeName,
        etfCount: 0,
        indexCount: 0,
        success: false,
        error: error instanceof Error ? error.message : '未知错误',
      }
    } finally {
      this.processingNodes.delete(nodeId)
    }
  }

  /**
   * 为单个节点匹配ETF和指数
   */
  async matchNode(
    nodeId: string,
    options: MatchOptions = {}
  ): Promise<NodeMatchResult> {
    // 防止重复处理
    if (this.processingNodes.has(nodeId)) {
      return {
        nodeId,
        nodeName: '',
        etfCount: 0,
        indexCount: 0,
        success: false,
        error: '节点正在处理中',
      }
    }

    this.processingNodes.add(nodeId)

    try {
      // 获取节点信息
      const node = await prisma.graphNode.findUnique({
        where: { id: nodeId },
        include: {
          parent: true,
        },
      })

      if (!node) {
        throw new Error('节点不存在')
      }

      const {
        matchETF = true,
        matchIndex = true,
        topN = 5,
        minRelevance = 0.6,
        forceRefresh = false,
      } = options

      // 获取ETF和指数列表
      const [etfList, indexList] = await Promise.all([
        matchETF ? etfIndexFetcher.getETFList({ limit: 500, forceRefresh }) : Promise.resolve([]),
        matchIndex ? etfIndexFetcher.getIndexList({ forceRefresh }) : Promise.resolve([]),
      ])

      // 关键词初筛
      const etfCandidates = matchETF
        ? keywordMatcher.filterByKeywords(node.name, etfList, {
            minScore: 0.2,
            maxResults: 20,
          })
        : []

      const indexCandidates = matchIndex
        ? keywordMatcher.filterByKeywords(node.name, indexList, {
            minScore: 0.2,
            maxResults: 20,
          })
        : []

      // 如果关键词筛选后没有候选项，直接返回
      if (etfCandidates.length === 0 && indexCandidates.length === 0) {
        console.log(`节点 ${node.name} 没有匹配的候选项`)
        return {
          nodeId,
          nodeName: node.name,
          etfCount: 0,
          indexCount: 0,
          success: true,
        }
      }

      // AI精准匹配
      const matchResult = await this.aiMatch({
        nodeName: node.name,
        nodeType: node.type,
        nodeDescription: node.description || undefined,
        industryContext: node.parent?.name,
        etfCandidates: etfCandidates.map(e => ({ ticker: e.ticker, name: e.name })),
        indexCandidates: indexCandidates.map(i => ({ code: i.code, name: i.name })),
      })

      // 过滤并保存结果
      const filteredETFs = matchResult.etfs
        .filter(e => e.relevance >= minRelevance)
        .slice(0, topN)

      const filteredIndices = matchResult.indices
        .filter(i => i.relevance >= minRelevance)
        .slice(0, topN)

      // 删除旧的绑定（复写模式）
      await Promise.all([
        prisma.graphNodeETF.deleteMany({ where: { nodeId } }),
        prisma.graphNodeIndex.deleteMany({ where: { nodeId } }),
      ])

      // 保存新的绑定
      await Promise.all([
        ...filteredETFs.map(etf =>
          prisma.graphNodeETF.create({
            data: {
              nodeId,
              etfCode: etf.code,
              etfName: etf.name,
              weight: etf.relevance,
              description: etf.reasoning,
              isActive: true,
            },
          })
        ),
        ...filteredIndices.map(index =>
          prisma.graphNodeIndex.create({
            data: {
              nodeId,
              indexCode: index.code,
              indexName: index.name,
              relevance: index.relevance,
              description: index.reasoning,
              isActive: true,
            },
          })
        ),
      ])

      return {
        nodeId,
        nodeName: node.name,
        etfCount: filteredETFs.length,
        indexCount: filteredIndices.length,
        success: true,
      }
    } catch (error) {
      console.error(`匹配节点 ${nodeId} 失败:`, error)
      return {
        nodeId,
        nodeName: '',
        etfCount: 0,
        indexCount: 0,
        success: false,
        error: error instanceof Error ? error.message : '未知错误',
      }
    } finally {
      this.processingNodes.delete(nodeId)
    }
  }

  /**
   * 为产业的所有节点批量匹配
   */
  async matchIndustry(
    industryId: string,
    options: MatchOptions = {}
  ): Promise<{
    success: boolean
    matched: number
    failed: number
    details: NodeMatchResult[]
  }> {
    try {
      // 从Neo4j获取产业的泳道图数据
      const DATA_SERVICE_URL = process.env.DATA_SERVICE_URL || 'http://localhost:8000'
      const response = await fetch(`${DATA_SERVICE_URL}/api/v1/industries/${industryId}/swimlane`)

      if (!response.ok) {
        throw new Error(`获取产业数据失败: ${response.status}`)
      }

      const swimlaneData = await response.json()

      // 提取所有segment节点
      const segments: Array<{ id: string; name: string }> = []

      if (swimlaneData.lanes) {
        // 遍历所有泳道（upstream, midstream, downstream）
        for (const lane of Object.values(swimlaneData.lanes as Record<string, any>)) {
          if (lane.segments && Array.isArray(lane.segments)) {
            segments.push(...lane.segments.map((seg: any) => ({
              id: seg.id,
              name: seg.name
            })))
          }
        }
      } else if (swimlaneData.stages) {
        // 备用：如果返回的是stages格式
        for (const stage of swimlaneData.stages) {
          if (stage.segments && Array.isArray(stage.segments)) {
            segments.push(...stage.segments.map((seg: any) => ({
              id: seg.id,
              name: seg.name
            })))
          }
        }
      }

      if (segments.length === 0) {
        console.log(`产业 ${industryId} 没有可匹配的节点`)
        return {
          success: true,
          matched: 0,
          failed: 0,
          details: [],
        }
      }

      console.log(`找到 ${segments.length} 个节点待匹配`)

      // 批量匹配（串行处理，避免API限流）
      const results: NodeMatchResult[] = []
      for (const segment of segments) {
        const result = await this.matchNodeByName(segment.id, segment.name, options)
        results.push(result)

        // 添加延迟，避免API限流
        await new Promise(resolve => setTimeout(resolve, 1000))
      }

      const matched = results.filter(r => r.success).length
      const failed = results.filter(r => !r.success).length

      return {
        success: true,
        matched,
        failed,
        details: results,
      }
    } catch (error) {
      console.error('批量匹配产业失败:', error)
      return {
        success: false,
        matched: 0,
        failed: 0,
        details: [],
      }
    }
  }

  /**
   * 全局匹配（所有节点）
   */
  async matchAll(
    options: MatchOptions = {}
  ): Promise<{
    success: boolean
    matched: number
    failed: number
    details: NodeMatchResult[]
  }> {
    try {
      // 获取所有有效节点（排除根节点）
      const nodes = await prisma.graphNode.findMany({
        where: {
          level: {
            gt: 0,
          },
        },
        select: { id: true },
      })

      if (nodes.length === 0) {
        return {
          success: false,
          matched: 0,
          failed: 0,
          details: [],
        }
      }

      // 批量匹配（串行处理）
      const results: NodeMatchResult[] = []
      for (const node of nodes) {
        const result = await this.matchNode(node.id, options)
        results.push(result)

        // 添加延迟，避免API限流
        await new Promise(resolve => setTimeout(resolve, 1000))
      }

      const matched = results.filter(r => r.success).length
      const failed = results.filter(r => !r.success).length

      return {
        success: true,
        matched,
        failed,
        details: results,
      }
    } catch (error) {
      console.error('全局匹配失败:', error)
      return {
        success: false,
        matched: 0,
        failed: 0,
        details: [],
      }
    }
  }

  /**
   * 使用AI进行精准匹配
   */
  private async aiMatch(params: {
    nodeName: string
    nodeType: string
    nodeDescription?: string
    industryContext?: string
    etfCandidates: Array<{ ticker: string; name: string }>
    indexCandidates: Array<{ code: string; name: string }>
  }): Promise<MatchResult> {
    try {
      const prompt = buildMatchingPrompt(params)

      const response = await this.aiClient.complete({
        prompt,
        maxTokens: 2048,
      })

      // 提取JSON
      const jsonMatch = response.match(/\{[\s\S]*\}/)
      if (!jsonMatch) {
        throw new Error('AI响应格式异常，无法提取JSON')
      }

      const result = JSON.parse(jsonMatch[0]) as MatchResult

      return {
        etfs: result.etfs || [],
        indices: result.indices || [],
      }
    } catch (error) {
      console.error('AI匹配失败:', error)
      // 返回空结果
      return {
        etfs: [],
        indices: [],
      }
    }
  }

  /**
   * 获取节点的匹配状态
   */
  async getMatchStatus(nodeId: string): Promise<{
    hasETF: boolean
    hasIndex: boolean
    etfCount: number
    indexCount: number
    lastMatchedAt: string | null
  }> {
    const [etfs, indices] = await Promise.all([
      prisma.graphNodeETF.findMany({
        where: { nodeId, isActive: true },
      }),
      prisma.graphNodeIndex.findMany({
        where: { nodeId, isActive: true },
      }),
    ])

    const lastMatchedAt =
      etfs.length > 0 || indices.length > 0
        ? new Date(
            Math.max(
              ...etfs.map((e: any) => e.createdAt.getTime()),
              ...indices.map((i: any) => i.createdAt.getTime())
            )
          ).toISOString()
        : null

    return {
      hasETF: etfs.length > 0,
      hasIndex: indices.length > 0,
      etfCount: etfs.length,
      indexCount: indices.length,
      lastMatchedAt,
    }
  }
}

export const etfIndexMatcher = new ETFIndexMatcherService()
