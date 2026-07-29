import { describe, it, expect } from 'vitest'
import { validateExtractionResult, GRAPH_EXTRACTION_SCHEMA } from '../graph-extraction.schema'

describe('Graph Extraction Schema', () => {
  it('should validate correct extraction result', () => {
    const validResult = {
      entities: [
        {
          name: 'NVIDIA',
          type: 'chip_design',
          description: 'GPU芯片设计公司',
          confidence: 0.95,
          evidence: ['文中提到NVIDIA是GPU领域的领导者']
        }
      ],
      relations: [
        {
          source: 'NVIDIA',
          target: 'TSMC',
          relation: 'supply_chain',
          weight: 0.9,
          direction: 'positive',
          confidence: 0.88,
          evidence: ['NVIDIA芯片由TSMC代工生产'],
          lag: '1-2个月'
        }
      ],
      summary: '分析了NVIDIA与TSMC的供应链关系'
    }

    const result = validateExtractionResult(validResult)
    expect(result.success).toBe(true)
  })

  it('should reject invalid entity type', () => {
    const invalidResult = {
      entities: [{
        name: 'Test',
        type: 'invalid_type',
        confidence: 0.9,
        evidence: []
      }],
      relations: [],
      summary: 'test'
    }

    const result = validateExtractionResult(invalidResult)
    expect(result.success).toBe(false)
  })

  it('should reject confidence out of range', () => {
    const invalidResult = {
      entities: [{
        name: 'Test',
        type: 'chip_design',
        confidence: 1.5,  // > 1.0
        evidence: []
      }],
      relations: [],
      summary: 'test'
    }

    const result = validateExtractionResult(invalidResult)
    expect(result.success).toBe(false)
  })
})
