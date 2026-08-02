// 知识图谱服务
// 提供图谱数据查询、传导路径分析、图谱编辑等功能

import prisma from '@/lib/db/prisma'
import type { GraphNode, GraphEdge } from '@/types/graph'

export interface PropagationPath {
  trigger: {
    event: string
    sourceNode: string
  }
  paths: Array<{
    nodes: string[]
    edges: GraphEdge[]
    totalLag: string
    finalImpact: {
      node: string
      direction: string
      magnitude: number
      confidence: number
    }
    explanation: string
  }>
  affectedStocks: Array<{
    ticker: string
    name: string
    impactDirection: string
    impactReasoning: string
    timeHorizon: string
  }>
}

export class GraphService {
  /**
   * 获取所有图谱节点
   */
  async getNodes(params?: {
    type?: string
    level?: number
    parentId?: string
  }): Promise<GraphNode[]> {
    const where: any = {}
    if (params?.type) where.type = params.type
    if (params?.level !== undefined) where.level = params.level
    if (params?.parentId) where.parentId = params.parentId

    const nodes = await prisma.graphNode.findMany({
      where,
      include: {
        children: true,
        stocks: true,
        sourceEdges: {
          include: { target: true }
        },
        targetEdges: {
          include: { source: true }
        }
      },
      orderBy: { level: 'asc' }
    })

    return nodes as unknown as GraphNode[]
  }

  /**
   * 获取单个节点详情
   */
  async getNode(id: string): Promise<GraphNode | null> {
    const node = await prisma.graphNode.findUnique({
      where: { id },
      include: {
        children: true,
        stocks: true,
        sourceEdges: {
          include: { target: true }
        },
        targetEdges: {
          include: { source: true }
        }
      }
    })

    return node as unknown as GraphNode
  }

  /**
   * 获取层级树形结构
   */
  async getTree(rootId?: string): Promise<GraphNode[]> {
    const where: any = { parentId: rootId || null }
    const nodes = await prisma.graphNode.findMany({
      where,
      include: {
        children: true,
        stocks: true,
      },
      orderBy: { name: 'asc' }
    })

    const tree = await Promise.all(
      nodes.map(async (node) => {
        const children = await this.getTree(node.id)
        return {
          ...node,
          children
        }
      })
    )

    return tree as unknown as GraphNode[]
  }

  /**
   * 获取所有图谱边
   */
  async getEdges(params?: {
    sourceId?: string
    targetId?: string
    relation?: string
  }): Promise<GraphEdge[]> {
    const where: any = {}
    if (params?.sourceId) where.sourceId = params.sourceId
    if (params?.targetId) where.targetId = params.targetId
    if (params?.relation) where.relation = params.relation

    const edges = await prisma.graphEdge.findMany({
      where,
      include: {
        source: true,
        target: true
      }
    })

    return edges as unknown as GraphEdge[]
  }

  /**
   * 获取完整图谱数据（扁平结构，不含嵌套）
   */
  async getFullGraph(): Promise<{ nodes: GraphNode[]; edges: GraphEdge[] }> {
    const [nodes, edges] = await Promise.all([
      prisma.graphNode.findMany({
        orderBy: { level: 'asc' }
      }),
      prisma.graphEdge.findMany()
    ])

    return { nodes: nodes as unknown as GraphNode[], edges: edges as unknown as GraphEdge[] }
  }

  /**
   * 传导路径分析
   */
  async analyzePropagation(
    triggerEvent: string,
    sourceNodeId?: string,
    maxDepth: number = 4
  ): Promise<PropagationPath> {
    const edges = await this.getEdges()
    const sourceNode = sourceNodeId || await this.identifySourceNode(triggerEvent)
    const paths = this.bfsPaths(edges, sourceNode, maxDepth)

    const scoredPaths = paths
      .map(path => ({
        ...path,
        score: this.scorePath(path, triggerEvent)
      }))
      .sort((a, b) => b.score - a.score)
      .slice(0, 5)

    // 收集所有路径中涉及的节点ID，批量查询中文名称
    const allNodeIds = new Set<string>()
    for (const p of scoredPaths) {
      for (const nodeId of p.nodes) {
        allNodeIds.add(nodeId)
      }
    }

    const nodes = await prisma.graphNode.findMany({
      where: { id: { in: Array.from(allNodeIds) } },
      select: { id: true, name: true, type: true }
    })

    const nodeIdToName = new Map<string, string>()
    for (const n of nodes) {
      nodeIdToName.set(n.id, n.name)
    }

    // 将路径中的节点ID替换为中文名称
    const resolvedPaths = scoredPaths.map(p => ({
      ...p,
      nodes: p.nodes.map(id => nodeIdToName.get(id) || id)
    }))

    return {
      trigger: {
        event: triggerEvent,
        sourceNode: nodeIdToName.get(sourceNode) || sourceNode
      },
      paths: resolvedPaths.map(p => ({
        nodes: p.nodes,
        edges: p.edges,
        totalLag: this.calculateTotalLag(p.edges),
        finalImpact: {
          node: p.nodes[p.nodes.length - 1],
          direction: 'positive',
          magnitude: Math.min(5, Math.round(p.score / 20)),
          confidence: Math.min(1, p.score / 100)
        },
        explanation: this.generateExplanation(p, triggerEvent)
      })),
      affectedStocks: this.identifyAffectedStocks(resolvedPaths)
    }
  }

  /**
   * 创建节点
   */
  async createNode(data: {
    type: string
    name: string
    description?: string
    parentId?: string
    level: number
    cyclePos?: string
    momentum?: number
  }): Promise<GraphNode> {
    const node = await prisma.graphNode.create({
      data: {
        type: data.type,
        name: data.name,
        description: data.description,
        parentId: data.parentId,
        level: data.level,
        cyclePos: data.cyclePos,
        momentum: data.momentum,
      }
    })

    await prisma.graphChangeLog.create({
      data: {
        nodeId: node.id,
        action: 'add_node',
        after: JSON.stringify(node),
        reason: '手动添加节点',
        source: 'manual',
      }
    })

    return node as unknown as GraphNode
  }

  /**
   * 更新节点
   */
  async updateNode(id: string, data: Partial<GraphNode>): Promise<GraphNode> {
    const before = await prisma.graphNode.findUnique({ where: { id } })

    const node = await prisma.graphNode.update({
      where: { id },
      data: {
        name: data.name,
        description: data.description,
        type: data.type,
        level: data.level,
        cyclePos: data.cyclePos,
        momentum: data.momentum,
      }
    })

    await prisma.graphChangeLog.create({
      data: {
        nodeId: id,
        action: 'update_node',
        before: JSON.stringify(before),
        after: JSON.stringify(node),
        reason: '手动更新节点',
        source: 'manual',
      }
    })

    return node as unknown as GraphNode
  }

  /**
   * 删除节点
   */
  async deleteNode(id: string): Promise<void> {
    const before = await prisma.graphNode.findUnique({ where: { id } })

    await prisma.graphEdge.deleteMany({
      where: {
        OR: [{ sourceId: id }, { targetId: id }]
      }
    })

    await prisma.graphNode.delete({ where: { id } })

    await prisma.graphChangeLog.create({
      data: {
        nodeId: id,
        action: 'delete_node',
        before: JSON.stringify(before),
        reason: '手动删除节点',
        source: 'manual',
      }
    })
  }

  /**
   * 更新边
   */
  async updateEdge(id: string, data: Partial<GraphEdge>): Promise<GraphEdge> {
    const before = await prisma.graphEdge.findUnique({ where: { id } })

    const edge = await prisma.graphEdge.update({
      where: { id },
      data: {
        relation: data.relation,
        weight: data.weight,
        direction: data.direction,
        lag: data.lag,
        confidence: data.confidence,
        description: data.description,
      }
    })

    await prisma.graphChangeLog.create({
      data: {
        edgeId: id,
        action: 'update_edge',
        before: JSON.stringify(before),
        after: JSON.stringify(edge),
        reason: '手动更新关系',
        source: 'manual',
      }
    })

    return edge as unknown as GraphEdge
  }

  /**
   * 删除边
   */
  async deleteEdge(id: string): Promise<void> {
    const before = await prisma.graphEdge.findUnique({ where: { id } })

    await prisma.graphEdge.delete({ where: { id } })

    await prisma.graphChangeLog.create({
      data: {
        edgeId: id,
        action: 'delete_edge',
        before: JSON.stringify(before),
        reason: '手动删除关系',
        source: 'manual',
      }
    })
  }

  /**
   * 创建边
   */
  async createEdge(data: {
    sourceId: string
    targetId: string
    relation: string
    weight: number
    direction: string
    lag?: string
    confidence: number
    description?: string
  }): Promise<GraphEdge> {
    const edge = await prisma.graphEdge.create({
      data: {
        sourceId: data.sourceId,
        targetId: data.targetId,
        relation: data.relation,
        weight: data.weight,
        direction: data.direction,
        lag: data.lag,
        confidence: data.confidence,
        description: data.description,
      }
    })

    await prisma.graphChangeLog.create({
      data: {
        edgeId: edge.id,
        action: 'add_edge',
        after: JSON.stringify(edge),
        reason: '手动添加关系',
        source: 'manual',
      }
    })

    return edge as unknown as GraphEdge
  }

  /**
   * 获取变更日志
   */
  async getChangelog(limit: number = 50): Promise<any[]> {
    const logs = await prisma.graphChangeLog.findMany({
      take: limit,
      orderBy: { createdAt: 'desc' },
      include: {
        node: true
      }
    })

    return logs
  }

  // ==================== 私有方法 ====================

  private async identifySourceNode(event: string): Promise<string> {
    const eventLower = event.toLowerCase()

    // 关键词到节点type的映射
    const typeMapping: Record<string, string> = {
      'gpu': 'chip_design',
      'nvidia': 'chip_design',
      'ai芯片': 'chip_design',
      '芯片': 'chip_design',
      'hbm': 'memory',
      '存储': 'memory',
      '服务器': 'server',
      '算力': 'server',
      '光模块': 'optical_module',
      '光通信': 'optical_comm',
      '液冷': 'cooling',
      '散热': 'cooling',
    }

    let matchedType = 'chip_design' // 默认
    for (const [keyword, type] of Object.entries(typeMapping)) {
      if (eventLower.includes(keyword)) {
        matchedType = type
        break
      }
    }

    // 查找该type对应的节点ID
    const node = await prisma.graphNode.findFirst({
      where: { type: matchedType },
      select: { id: true }
    })

    return node?.id || matchedType
  }

  private bfsPaths(edges: GraphEdge[], startNodeId: string, maxDepth: number): Array<{
    nodes: string[]
    edges: GraphEdge[]
  }> {
    const paths: Array<{ nodes: string[]; edges: GraphEdge[] }> = []
    const queue: Array<{ node: string; path: string[]; edgePath: GraphEdge[] }> = [
      { node: startNodeId, path: [startNodeId], edgePath: [] }
    ]

    while (queue.length > 0) {
      const { node, path, edgePath } = queue.shift()!

      if (path.length > maxDepth) continue

      // 匹配：sourceId === nodeId
      const outEdges = edges.filter(e => e.sourceId === node)

      for (const edge of outEdges) {
        const nextNode = edge.targetId || ''
        if (!nextNode || path.includes(nextNode)) continue

        const newPath = [...path, nextNode]
        const newEdgePath = [...edgePath, edge]

        paths.push({ nodes: newPath, edges: newEdgePath })

        queue.push({ node: nextNode, path: newPath, edgePath: newEdgePath })
      }
    }

    return paths
  }

  private scorePath(path: { nodes: string[]; edges: GraphEdge[] }, event: string): number {
    let score = 0

    const avgConfidence = path.edges.reduce((sum, e) => sum + (e.confidence || 0.5), 0) / path.edges.length
    score += avgConfidence * 30

    score += Math.max(0, (5 - path.nodes.length)) * 10

    const totalWeight = path.edges.reduce((sum, e) => sum + (e.weight || 0.5), 0)
    score += totalWeight * 20

    return score
  }

  private calculateTotalLag(edges: GraphEdge[]): string {
    const lags = edges.map(e => e.lag || '即时').filter(l => l !== '即时')
    if (lags.length === 0) return '即时'
    return lags[lags.length - 1]
  }

  private generateExplanation(path: { nodes: string[]; edges: GraphEdge[] }, event: string): string {
    const steps = path.edges.map((edge, i) => {
      const source = path.nodes[i]
      const target = path.nodes[i + 1]
      return `${source} → ${target}（${edge.description || edge.relation}）`
    })

    return `传导路径：${steps.join(' → ')}`
  }

  private identifyAffectedStocks(paths: Array<{ nodes: string[]; edges: GraphEdge[] }>): Array<{
    ticker: string
    name: string
    impactDirection: string
    impactReasoning: string
    timeHorizon: string
  }> {
    // 收集所有路径末端节点
    const terminalNodeIds = new Set<string>()
    for (const path of paths) {
      if (path.nodes.length > 0) {
        terminalNodeIds.add(path.nodes[path.nodes.length - 1])
      }
    }

    // 从数据库查询这些节点关联的股票
    const stocks: Array<{
      ticker: string
      name: string
      impactDirection: string
      impactReasoning: string
      timeHorizon: string
    }> = []

    // 同步方式：从已有路径的 edges 中提取关联信息
    // 因为 identifyAffectedStocks 是同步方法，不能直接 await
    // 使用 edge 中的 target 信息作为关联股票
    const seenTickers = new Set<string>()
    for (const path of paths) {
      const lastEdge = path.edges[path.edges.length - 1]
      if (lastEdge?.target) {
        const target = lastEdge.target
        // 如果 target 有 stocks 关联
        if (target.stocks && Array.isArray(target.stocks)) {
          for (const stock of target.stocks) {
            if (!seenTickers.has(stock.ticker)) {
              seenTickers.add(stock.ticker)
              stocks.push({
                ticker: stock.ticker,
                name: stock.name || stock.ticker,
                impactDirection: lastEdge.direction || 'positive',
                impactReasoning: `通过 ${target.name} 传导`,
                timeHorizon: lastEdge.lag || '短期',
              })
            }
          }
        }
      }
    }

    return stocks
  }
}

// 全局单例
export const graphService = new GraphService()
