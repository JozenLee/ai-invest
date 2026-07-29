import prisma from '@/lib/db/prisma'
import { graphRuleEngine } from './graph-rule-engine.service'
import type { ExtractionResult } from '@/lib/ai/schemas/graph-extraction.schema'
import type { GraphNode, GraphEdge } from '@/types/graph'

export interface SuggestionFilters {
  status?: string
  source?: string
  type?: string
  minConfidence?: number
  limit?: number
}

export class GraphSuggestionService {
  /**
   * 从抽取结果创建建议
   */
  async createFromExtraction(
    jobId: string,
    extraction: ExtractionResult
  ): Promise<number> {
    const suggestions = []

    // 创建实体建议
    for (const entity of extraction.entities) {
      // 规则验证（节点级别的验证较少，主要在边上）
      suggestions.push({
        type: 'add_node',
        targetType: 'node',
        data: JSON.stringify({
          name: entity.name,
          type: entity.type,
          description: entity.description,
          level: this.inferLevel(entity.type), // 根据type推断level
        }),
        confidence: entity.confidence,
        source: 'ai_extraction',
        sourceRef: jobId,
        evidence: JSON.stringify(entity.evidence),
        status: 'pending'
      })
    }

    // 创建关系建议
    for (const relation of extraction.relations) {
      // 规则验证
      const edge: Partial<GraphEdge> = {
        relation: relation.relation,
        direction: relation.direction,
        weight: relation.weight,
        confidence: relation.confidence,
        sourceId: '', // placeholder
        targetId: ''
      }

      const validation = graphRuleEngine.validateEdge(edge as GraphEdge)

      if (!validation.valid) {
        // 验证失败，记录但不创建建议
        console.warn(`Edge validation failed: ${validation.violations.join(', ')}`)
        continue
      }

      suggestions.push({
        type: 'add_edge',
        targetType: 'edge',
        data: JSON.stringify({
          source: relation.source,
          target: relation.target,
          relation: relation.relation,
          weight: relation.weight,
          direction: relation.direction,
          lag: relation.lag,
          confidence: relation.confidence
        }),
        confidence: relation.confidence,
        source: 'ai_extraction',
        sourceRef: jobId,
        evidence: JSON.stringify(relation.evidence),
        status: 'pending'
      })
    }

    // 批量插入
    if (suggestions.length > 0) {
      await prisma.graphSuggestion.createMany({
        data: suggestions
      })

      // 更新job的建议数量
      await prisma.graphExtractionJob.update({
        where: { id: jobId },
        data: { suggestionsCreated: suggestions.length }
      })
    }

    return suggestions.length
  }

  /**
   * 获取建议列表
   */
  async getSuggestions(filters: SuggestionFilters = {}) {
    const where: any = {}

    if (filters.status) where.status = filters.status
    if (filters.source) where.source = filters.source
    if (filters.type) where.type = filters.type
    if (filters.minConfidence !== undefined) {
      where.confidence = { gte: filters.minConfidence }
    }

    return await prisma.graphSuggestion.findMany({
      where,
      orderBy: [
        { confidence: 'desc' },
        { createdAt: 'desc' }
      ],
      take: filters.limit || 100
    })
  }

  /**
   * 批准建议
   */
  async approveSuggestion(id: string, reviewedBy: string): Promise<void> {
    const suggestion = await prisma.graphSuggestion.findUnique({
      where: { id }
    })

    if (!suggestion) {
      throw new Error(`Suggestion ${id} not found`)
    }

    if (suggestion.status !== 'pending') {
      throw new Error(`Suggestion ${id} is not pending (status: ${suggestion.status})`)
    }

    // 应用到图谱
    await this.applySuggestion(suggestion)

    // 更新建议状态
    await prisma.graphSuggestion.update({
      where: { id },
      data: {
        status: 'applied',
        reviewedBy,
        reviewedAt: new Date(),
        appliedAt: new Date()
      }
    })
  }

  /**
   * 拒绝建议
   */
  async rejectSuggestion(
    id: string,
    reviewedBy: string,
    note?: string
  ): Promise<void> {
    await prisma.graphSuggestion.update({
      where: { id },
      data: {
        status: 'rejected',
        reviewedBy,
        reviewedAt: new Date(),
        reviewNote: note
      }
    })
  }

  /**
   * 批量批准
   */
  async batchApprove(ids: string[], reviewedBy: string): Promise<number> {
    let count = 0

    for (const id of ids) {
      try {
        await this.approveSuggestion(id, reviewedBy)
        count++
      } catch (error) {
        console.error(`Failed to approve suggestion ${id}:`, error)
      }
    }

    return count
  }

  /**
   * 应用建议到图谱
   */
  private async applySuggestion(suggestion: any): Promise<void> {
    const data = JSON.parse(suggestion.data)

    if (suggestion.type === 'add_node') {
      // 创建节点
      const node = await prisma.graphNode.create({
        data: {
          name: data.name,
          type: data.type,
          description: data.description,
          level: data.level,
          cyclePos: data.cyclePos,
          momentum: data.momentum,
          parentId: data.parentId
        }
      })

      // 记录变更日志
      await prisma.graphChangeLog.create({
        data: {
          nodeId: node.id,
          action: 'add_node',
          after: JSON.stringify(node),
          reason: `AI建议批准（置信度${suggestion.confidence}）`,
          source: suggestion.source
        }
      })
    } else if (suggestion.type === 'add_edge') {
      // 查找source和target节点
      const sourceNode = await prisma.graphNode.findFirst({
        where: { name: data.source }
      })
      const targetNode = await prisma.graphNode.findFirst({
        where: { name: data.target }
      })

      if (!sourceNode || !targetNode) {
        throw new Error(`Source or target node not found: ${data.source} -> ${data.target}`)
      }

      // 创建边
      const edge = await prisma.graphEdge.create({
        data: {
          sourceId: sourceNode.id,
          targetId: targetNode.id,
          relation: data.relation,
          weight: data.weight,
          direction: data.direction,
          lag: data.lag,
          confidence: data.confidence
        }
      })

      // 记录变更日志
      await prisma.graphChangeLog.create({
        data: {
          edgeId: edge.id,
          action: 'add_edge',
          after: JSON.stringify(edge),
          reason: `AI建议批准（置信度${suggestion.confidence}）`,
          source: suggestion.source
        }
      })
    }
  }

  /**
   * 根据节点类型推断层级
   */
  private inferLevel(type: string): number {
    const levelMap: Record<string, number> = {
      index: 0,
      industry_l1: 1,
      industry_l2: 2,
      sub_sector: 3,
      stock: 4,
      // 产业链节点默认为3
      chip_design: 3,
      wafer_foundry: 3,
      packaging: 3,
      equipment: 3,
      material: 3,
      eda: 3,
      memory: 3,
      server: 3,
      cooling: 3,
      power: 3,
      pcb: 3,
      networking: 3,
      data_center: 3,
      cloud: 3,
      ai_application: 3,
      terminal_device: 3,
      optical_comm: 3,
      cpo: 3,
      optical_module: 3,
      // 外部驱动节点
      policy: 2,
      macro: 2,
      technology: 2,
      demand: 2
    }

    return levelMap[type] || 3
  }
}

// Singleton instance
export const graphSuggestionService = new GraphSuggestionService()
