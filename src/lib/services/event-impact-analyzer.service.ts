import Anthropic from '@anthropic-ai/sdk'
import { prisma } from '@/lib/db'

/**
 * 事件影响分析服务（增强版）
 * Phase 2: 智能集成层 - 基于图谱的影响传导分析
 */

interface PropagationPath {
  path: string[] // 节点ID数组
  edges: Array<{
    sourceId: string
    targetId: string
    relation: string
    weight: number
    direction: string
    lag?: string
  }>
  totalLag: string
  finalImpact: {
    nodeId: string
    nodeName: string
    impactScore: number // -5 ~ +5
    confidence: number
    reasoning: string
  }
}

interface AffectedSector {
  sectorName: string
  impactScore: number
  affectedNodes: string[]
  timeHorizon: string
}

interface AffectedETF {
  ticker: string
  name: string
  exposure: number
  impactScore: number
  reasoning: string
}

export interface ImpactAnalysisResult {
  trigger: {
    event: string
    sourceNodes: Array<{
      id: string
      name: string
      type: string
    }>
    impactDirection: 'positive' | 'negative'
    magnitude: number
  }
  propagationPaths: PropagationPath[]
  affectedSectors: AffectedSector[]
  affectedETFs: AffectedETF[]
  visualizationData: {
    highlightedNodes: string[]
    highlightedEdges: string[]
    heatmap: Record<string, number>
  }
  metadata: {
    tokensUsed: number
    durationMs: number
  }
}

export class EventImpactAnalyzerService {
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
   * 分析事件对产业链的影响
   */
  async analyzeEventImpact(
    eventDescription: string,
    sourceNodeIds: string[],
    impactDirection: 'positive' | 'negative',
    magnitude: number = 5,
    maxDepth: number = 4
  ): Promise<ImpactAnalysisResult> {
    const startTime = Date.now()

    // 1. 获取源节点信息
    const sourceNodes = await prisma.graphNode.findMany({
      where: { id: { in: sourceNodeIds } }
    })

    if (sourceNodes.length === 0) {
      throw new Error('Source nodes not found')
    }

    // 2. 计算传导路径（BFS）
    const paths = await this.calculatePropagationPaths(sourceNodeIds, maxDepth)

    // 3. 使用AI评估每条路径的影响
    const evaluatedPaths = await this.evaluatePathsWithAI(
      eventDescription,
      impactDirection,
      magnitude,
      paths
    )

    const durationMs = Date.now() - startTime

    // 4. 聚合板块影响
    const affectedSectors = await this.aggregateSectorImpact(evaluatedPaths)

    // 5. 计算对ETF的影响
    const affectedETFs = await this.calculateETFImpact(evaluatedPaths)

    // 6. 生成可视化数据
    const visualizationData = this.generateVisualizationData(evaluatedPaths)

    return {
      trigger: {
        event: eventDescription,
        sourceNodes: sourceNodes.map(n => ({
          id: n.id,
          name: n.name,
          type: n.type
        })),
        impactDirection,
        magnitude
      },
      propagationPaths: evaluatedPaths,
      affectedSectors,
      affectedETFs,
      visualizationData,
      metadata: {
        tokensUsed: 0, // 会在AI评估中更新
        durationMs
      }
    }
  }

  /**
   * 使用BFS计算传导路径
   */
  private async calculatePropagationPaths(
    sourceNodeIds: string[],
    maxDepth: number
  ): Promise<Array<{
    path: string[]
    edges: any[]
  }>> {
    const paths: Array<{ path: string[], edges: any[] }> = []
    const visited = new Set<string>()

    // BFS队列: [当前节点ID, 路径, 边列表, 深度]
    const queue: Array<[string, string[], any[], number]> = sourceNodeIds.map(id =>
      [id, [id], [], 0]
    )

    while (queue.length > 0) {
      const [currentId, path, edges, depth] = queue.shift()!

      // 达到最大深度或已访问过（避免循环）
      if (depth >= maxDepth) {
        if (depth > 0) { // 至少有一条边
          paths.push({ path, edges })
        }
        continue
      }

      // 查找从当前节点出发的边
      const outgoingEdges = await prisma.graphEdge.findMany({
        where: { sourceId: currentId },
        include: {
          target: true
        }
      })

      for (const edge of outgoingEdges) {
        const nextId = edge.targetId

        // 避免路径中的循环
        if (path.includes(nextId)) {
          continue
        }

        const newPath = [...path, nextId]
        const newEdges = [...edges, {
          sourceId: edge.sourceId,
          targetId: edge.targetId,
          relation: edge.relation,
          weight: edge.weight,
          direction: edge.direction,
          lag: edge.lag
        }]

        // 加入队列继续探索
        queue.push([nextId, newPath, newEdges, depth + 1])

        // 如果已经有边，记录这条路径
        if (newEdges.length > 0) {
          paths.push({ path: newPath, edges: newEdges })
        }
      }
    }

    // 按路径长度排序（优先处理短路径）
    return paths.sort((a, b) => a.path.length - b.path.length).slice(0, 50) // 最多50条路径
  }

  /**
   * 使用AI评估路径影响
   */
  private async evaluatePathsWithAI(
    eventDescription: string,
    impactDirection: 'positive' | 'negative',
    magnitude: number,
    paths: Array<{ path: string[], edges: any[] }>
  ): Promise<PropagationPath[]> {
    if (paths.length === 0) {
      return []
    }

    // 获取所有涉及的节点信息
    const allNodeIds = new Set<string>()
    paths.forEach(p => p.path.forEach(id => allNodeIds.add(id)))

    const nodes = await prisma.graphNode.findMany({
      where: { id: { in: Array.from(allNodeIds) } }
    })

    const nodeMap = new Map(nodes.map(n => [n.id, n]))

    // 构建提示词
    const prompt = this.buildEvaluationPrompt(
      eventDescription,
      impactDirection,
      magnitude,
      paths,
      nodeMap
    )

    // 调用AI
    const response = await this.client.messages.create({
      model: process.env.CLAUDE_MODEL || 'claude-opus-5',
      max_tokens: 4000,
      temperature: 0.3,
      messages: [{
        role: 'user',
        content: prompt
      }]
    })

    // 解析结果
    const textContent = response.content.find(c => c.type === 'text')
    if (!textContent || textContent.type !== 'text') {
      throw new Error('No text content in Claude response')
    }

    let evaluations: any[]
    try {
      let jsonText = textContent.text.trim()
      if (jsonText.startsWith('```json')) {
        jsonText = jsonText.replace(/^```json\s*\n/, '').replace(/\n```\s*$/, '')
      } else if (jsonText.startsWith('```')) {
        jsonText = jsonText.replace(/^```\s*\n/, '').replace(/\n```\s*$/, '')
      }
      jsonText = jsonText.replace(/,(\s*[}\]])/g, '$1')

      const parsed = JSON.parse(jsonText)
      evaluations = parsed.evaluations || []
    } catch (error) {
      console.error('Failed to parse AI evaluation:', textContent.text.substring(0, 500))
      throw new Error(`Failed to parse JSON: ${error}`)
    }

    // 组装结果
    return evaluations.map((evaluation: any, index: number) => {
      const originalPath = paths[index]
      const finalNodeId = originalPath.path[originalPath.path.length - 1]
      const finalNode = nodeMap.get(finalNodeId)

      // 计算总滞后时间
      const totalLag = this.calculateTotalLag(originalPath.edges)

      return {
        path: originalPath.path,
        edges: originalPath.edges,
        totalLag,
        finalImpact: {
          nodeId: finalNodeId,
          nodeName: finalNode?.name || 'Unknown',
          impactScore: evaluation.impactScore || 0,
          confidence: evaluation.confidence || 0.5,
          reasoning: evaluation.reasoning || ''
        }
      }
    })
  }

  /**
   * 构建AI评估提示词
   */
  private buildEvaluationPrompt(
    eventDescription: string,
    impactDirection: 'positive' | 'negative',
    magnitude: number,
    paths: Array<{ path: string[], edges: any[] }>,
    nodeMap: Map<string, any>
  ): string {
    const pathDescriptions = paths.map((p, index) => {
      const pathNames = p.path.map(id => nodeMap.get(id)?.name || id).join(' → ')
      const edgeDetails = p.edges.map(e =>
        `${e.relation}(权重${e.weight}, ${e.direction})`
      ).join(' → ')

      return `路径${index + 1}: ${pathNames}\n  传导关系: ${edgeDetails}`
    }).join('\n\n')

    return `你是一个产业链分析专家，负责评估事件对产业链的影响传导。

**事件描述**：
${eventDescription}

**事件初始影响**：
- 方向: ${impactDirection === 'positive' ? '利好' : '利空'}
- 强度: ${magnitude}/5

**传导路径**：
${pathDescriptions}

**任务**：
评估每条路径的最终影响，考虑：
1. 传导关系的合理性（供应链、需求驱动等）
2. 边的权重和方向
3. 路径长度（传导衰减）
4. 事件的初始影响强度

**输出格式**（JSON）：
{
  "evaluations": [
    {
      "pathIndex": 0,
      "impactScore": 3.5,  // -5到+5，正数为利好，负数为利空
      "confidence": 0.8,   // 0-1，评估置信度
      "reasoning": "简要说明影响传导逻辑和衰减原因"
    }
  ]
}

**评分规则**：
- 初始影响强度为基准
- 每经过一条边，影响衰减10-30%（取决于边权重）
- 如果边的direction为negative，影响方向反转
- 考虑传导的合理性，不合理的路径给低置信度

请返回JSON格式的评估结果：`
  }

  /**
   * 计算总滞后时间
   */
  private calculateTotalLag(edges: any[]): string {
    const lags = edges.map(e => e.lag).filter(Boolean)
    if (lags.length === 0) return '未知'

    // 简单相加（实际应该更智能地解析和累加）
    return lags.join(' + ')
  }

  /**
   * 聚合板块影响
   */
  private async aggregateSectorImpact(paths: PropagationPath[]): Promise<AffectedSector[]> {
    const sectorMap = new Map<string, {
      nodes: Set<string>
      totalImpact: number
      count: number
    }>()

    for (const path of paths) {
      const nodeId = path.finalImpact.nodeId
      const node = await prisma.graphNode.findUnique({
        where: { id: nodeId }
      })

      if (!node) continue

      // 使用节点类型作为板块（简化版，实际可能需要更复杂的映射）
      const sector = node.type

      if (!sectorMap.has(sector)) {
        sectorMap.set(sector, {
          nodes: new Set(),
          totalImpact: 0,
          count: 0
        })
      }

      const sectorData = sectorMap.get(sector)!
      sectorData.nodes.add(nodeId)
      sectorData.totalImpact += path.finalImpact.impactScore
      sectorData.count++
    }

    return Array.from(sectorMap.entries()).map(([sector, data]) => ({
      sectorName: sector,
      impactScore: data.totalImpact / data.count,
      affectedNodes: Array.from(data.nodes),
      timeHorizon: '1-3个月' // 简化版
    }))
  }

  /**
   * 计算ETF影响
   */
  private async calculateETFImpact(paths: PropagationPath[]): Promise<AffectedETF[]> {
    // 简化版：基于受影响节点的权重计算
    // 实际需要根据ETF持仓数据计算
    return []
  }

  /**
   * 生成可视化数据
   */
  private generateVisualizationData(paths: PropagationPath[]): {
    highlightedNodes: string[]
    highlightedEdges: string[]
    heatmap: Record<string, number>
  } {
    const highlightedNodes = new Set<string>()
    const highlightedEdges = new Set<string>()
    const heatmap: Record<string, number> = {}

    for (const path of paths) {
      // 收集所有节点
      path.path.forEach(nodeId => {
        highlightedNodes.add(nodeId)
        // 累加影响分数作为热度
        heatmap[nodeId] = (heatmap[nodeId] || 0) + Math.abs(path.finalImpact.impactScore)
      })

      // 收集所有边
      path.edges.forEach(edge => {
        highlightedEdges.add(`${edge.sourceId}-${edge.targetId}`)
      })
    }

    return {
      highlightedNodes: Array.from(highlightedNodes),
      highlightedEdges: Array.from(highlightedEdges),
      heatmap
    }
  }
}

// 导出单例
export const eventImpactAnalyzerService = new EventImpactAnalyzerService()
