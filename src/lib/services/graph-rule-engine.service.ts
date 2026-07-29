import type { GraphNode, GraphEdge, RelationType } from '@/types/graph'

export interface GraphRule {
  id: string
  name: string
  description: string
  type: 'validation' | 'inference' | 'constraint'
  priority: number
}

export interface ValidationResult {
  valid: boolean
  violations: string[]
  warnings: string[]
}

export interface InferredRelation {
  source: string
  target: string
  relation: RelationType
  weight: number
  direction: 'positive' | 'negative'
  confidence: number
  reasoning: string
}

export class GraphRuleEngine {
  private validationRules: GraphRule[]
  private inferenceRules: GraphRule[]

  constructor() {
    this.validationRules = [
      {
        id: 'rule_001',
        name: '供应链传导方向检查',
        description: '供应链关系不应该是负向',
        type: 'validation',
        priority: 10
      },
      {
        id: 'rule_002',
        name: '层级一致性约束',
        description: '父节点层级必须小于子节点',
        type: 'constraint',
        priority: 10
      },
      {
        id: 'rule_003',
        name: '置信度范围检查',
        description: '置信度必须在0-1之间',
        type: 'validation',
        priority: 10
      },
      {
        id: 'rule_004',
        name: '权重范围检查',
        description: '权重必须在0-1之间',
        type: 'validation',
        priority: 10
      }
    ]

    this.inferenceRules = [
      {
        id: 'rule_101',
        name: '自动推断间接关系',
        description: '如果A→B→C，且不存在A→C，则推断间接关系',
        type: 'inference',
        priority: 5
      }
    ]
  }

  /**
   * 验证边
   */
  validateEdge(edge: GraphEdge): ValidationResult {
    const violations: string[] = []
    const warnings: string[] = []

    // Rule 001: 供应链不应为负向
    if (edge.relation === 'supply_chain' && edge.direction === 'negative') {
      violations.push('supply_chain不应为负向')
    }

    // Rule 003: 置信度范围
    if (edge.confidence < 0 || edge.confidence > 1) {
      violations.push(`置信度${edge.confidence}超出范围[0,1]`)
    }

    // Rule 004: 权重范围
    if (edge.weight < 0 || edge.weight > 1) {
      violations.push(`权重${edge.weight}超出范围[0,1]`)
    }

    // Warnings
    if (edge.confidence < 0.5) {
      warnings.push('置信度较低，建议人工审核')
    }

    return {
      valid: violations.length === 0,
      violations,
      warnings
    }
  }

  /**
   * 验证节点层级关系
   */
  validateNodeHierarchy(childNode: GraphNode, parentNode: GraphNode): ValidationResult {
    const violations: string[] = []
    const warnings: string[] = []

    // Rule 002: 层级约束
    if (childNode.level <= parentNode.level) {
      violations.push('子节点层级必须大于父节点')
    }

    return {
      valid: violations.length === 0,
      violations,
      warnings
    }
  }

  /**
   * 推断间接关系
   */
  inferRelationships(nodes: GraphNode[], edges: GraphEdge[]): InferredRelation[] {
    const suggestions: InferredRelation[] = []

    // 构建邻接表
    const adjacencyMap = new Map<string, GraphEdge[]>()
    edges.forEach(edge => {
      if (!adjacencyMap.has(edge.sourceId)) {
        adjacencyMap.set(edge.sourceId, [])
      }
      adjacencyMap.get(edge.sourceId)!.push(edge)
    })

    // Rule 101: 推断间接关系（深度2）
    edges.forEach(edgeAB => {
      const nodeB = edgeAB.targetId
      const edgesBFromC = adjacencyMap.get(nodeB) || []

      edgesBFromC.forEach(edgeBC => {
        const nodeA = edgeAB.sourceId
        const nodeC = edgeBC.targetId

        // 检查是否已存在A→C的直接关系
        const directEdgeExists = edges.some(
          e => e.sourceId === nodeA && e.targetId === nodeC
        )

        if (!directEdgeExists && nodeA !== nodeC) {
          // 如果两条边关系类型相同，且都是正向，推断间接关系
          if (
            edgeAB.relation === edgeBC.relation &&
            edgeAB.direction === 'positive' &&
            edgeBC.direction === 'positive'
          ) {
            suggestions.push({
              source: nodeA,
              target: nodeC,
              relation: edgeAB.relation as RelationType,
              weight: Math.min(edgeAB.weight, edgeBC.weight) * 0.8, // 间接关系权重降低
              direction: 'positive',
              confidence: Math.min(edgeAB.confidence, edgeBC.confidence) * 0.7, // 置信度降低
              reasoning: `通过${this.getNodeName(nodeB, nodes)}间接传导`
            })
          }
        }
      })
    })

    return suggestions
  }

  private getNodeName(nodeId: string, nodes: GraphNode[]): string {
    const node = nodes.find(n => n.id === nodeId)
    return node?.name || nodeId
  }
}

// Singleton instance
export const graphRuleEngine = new GraphRuleEngine()
