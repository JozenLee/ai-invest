import { describe, it, expect } from 'vitest'
import { graphRuleEngine } from '../graph-rule-engine.service'
import type { GraphEdge, GraphNode } from '@/types/graph'

describe('GraphRuleEngine', () => {
  describe('validation rules', () => {
    it('should reject supply_chain with negative direction', () => {
      const edge: Partial<GraphEdge> = {
        relation: 'supply_chain',
        direction: 'negative',
        sourceId: 'node1',
        targetId: 'node2',
        weight: 0.8,
        confidence: 0.9
      }

      const result = graphRuleEngine.validateEdge(edge as GraphEdge)
      expect(result.valid).toBe(false)
      expect(result.violations).toContain('supply_chain不应为负向')
    })

    it('should accept valid edge', () => {
      const edge: Partial<GraphEdge> = {
        relation: 'supply_chain',
        direction: 'positive',
        sourceId: 'node1',
        targetId: 'node2',
        weight: 0.8,
        confidence: 0.9
      }

      const result = graphRuleEngine.validateEdge(edge as GraphEdge)
      expect(result.valid).toBe(true)
    })

    it('should validate node level hierarchy', () => {
      const parentNode: Partial<GraphNode> = {
        id: 'parent',
        level: 2,
        type: 'industry_l2',
        name: 'Parent'
      }

      const childNode: Partial<GraphNode> = {
        id: 'child',
        level: 1,
        type: 'industry_l1',
        name: 'Child',
        parentId: 'parent'
      }

      const result = graphRuleEngine.validateNodeHierarchy(
        childNode as GraphNode,
        parentNode as GraphNode
      )

      expect(result.valid).toBe(false)
      expect(result.violations).toContain('子节点层级必须大于父节点')
    })

    it('should reject confidence outside [0,1] range', () => {
      const edgeWithNegativeConfidence: Partial<GraphEdge> = {
        relation: 'supply_chain',
        direction: 'positive',
        sourceId: 'node1',
        targetId: 'node2',
        weight: 0.8,
        confidence: -0.1
      }

      const result1 = graphRuleEngine.validateEdge(edgeWithNegativeConfidence as GraphEdge)
      expect(result1.valid).toBe(false)
      expect(result1.violations).toContain('置信度-0.1超出范围[0,1]')

      const edgeWithHighConfidence: Partial<GraphEdge> = {
        relation: 'supply_chain',
        direction: 'positive',
        sourceId: 'node1',
        targetId: 'node2',
        weight: 0.8,
        confidence: 1.5
      }

      const result2 = graphRuleEngine.validateEdge(edgeWithHighConfidence as GraphEdge)
      expect(result2.valid).toBe(false)
      expect(result2.violations).toContain('置信度1.5超出范围[0,1]')
    })

    it('should reject weight outside [0,1] range', () => {
      const edgeWithNegativeWeight: Partial<GraphEdge> = {
        relation: 'supply_chain',
        direction: 'positive',
        sourceId: 'node1',
        targetId: 'node2',
        weight: -0.2,
        confidence: 0.9
      }

      const result1 = graphRuleEngine.validateEdge(edgeWithNegativeWeight as GraphEdge)
      expect(result1.valid).toBe(false)
      expect(result1.violations).toContain('权重-0.2超出范围[0,1]')

      const edgeWithHighWeight: Partial<GraphEdge> = {
        relation: 'supply_chain',
        direction: 'positive',
        sourceId: 'node1',
        targetId: 'node2',
        weight: 1.2,
        confidence: 0.9
      }

      const result2 = graphRuleEngine.validateEdge(edgeWithHighWeight as GraphEdge)
      expect(result2.valid).toBe(false)
      expect(result2.violations).toContain('权重1.2超出范围[0,1]')
    })

    it('should accept valid node hierarchy (child level > parent level)', () => {
      const parentNode: Partial<GraphNode> = {
        id: 'parent',
        level: 1,
        type: 'industry_l1',
        name: 'Parent'
      }

      const childNode: Partial<GraphNode> = {
        id: 'child',
        level: 2,
        type: 'industry_l2',
        name: 'Child',
        parentId: 'parent'
      }

      const result = graphRuleEngine.validateNodeHierarchy(
        childNode as GraphNode,
        parentNode as GraphNode
      )

      expect(result.valid).toBe(true)
      expect(result.violations).toHaveLength(0)
    })
  })

  describe('inference rules', () => {
    it('should infer indirect relationship', () => {
      const nodes: GraphNode[] = [
        { id: 'A', name: 'A', type: 'chip_design', level: 0 } as GraphNode,
        { id: 'B', name: 'B', type: 'wafer_foundry', level: 1 } as GraphNode,
        { id: 'C', name: 'C', type: 'packaging', level: 2 } as GraphNode
      ]

      const edges: GraphEdge[] = [
        {
          id: 'e1',
          sourceId: 'A',
          targetId: 'B',
          relation: 'supply_chain',
          weight: 0.9,
          direction: 'positive',
          confidence: 0.95
        } as GraphEdge,
        {
          id: 'e2',
          sourceId: 'B',
          targetId: 'C',
          relation: 'supply_chain',
          weight: 0.8,
          direction: 'positive',
          confidence: 0.9
        } as GraphEdge
      ]

      const suggestions = graphRuleEngine.inferRelationships(nodes, edges)

      const indirectSuggestion = suggestions.find(
        s => s.source === 'A' && s.target === 'C'
      )

      expect(indirectSuggestion).toBeDefined()
      expect(indirectSuggestion?.relation).toBe('supply_chain')
      expect(indirectSuggestion?.confidence).toBeLessThan(0.9) // 间接关系置信度降低
    })
  })
})
