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
        evidence: ['test']
      }],
      relations: [],
      summary: 'test summary here'
    }

    const result = validateExtractionResult(invalidResult)
    expect(result.success).toBe(false)
    expect(result.error).toContain('Confidence must be 0-1')
  })

  it('should reject invalid relation type', () => {
    const invalidResult = {
      entities: [],
      relations: [{
        source: 'A',
        target: 'B',
        relation: 'invalid_relation',
        weight: 0.5,
        direction: 'positive',
        confidence: 0.8,
        evidence: ['test']
      }],
      summary: 'test summary here'
    }

    const result = validateExtractionResult(invalidResult)
    expect(result.success).toBe(false)
    expect(result.error).toContain('Invalid relation type')
  })

  it('should reject invalid direction', () => {
    const invalidResult = {
      entities: [],
      relations: [{
        source: 'A',
        target: 'B',
        relation: 'supply_chain',
        weight: 0.5,
        direction: 'neutral',
        confidence: 0.8,
        evidence: ['test']
      }],
      summary: 'test summary here'
    }

    const result = validateExtractionResult(invalidResult)
    expect(result.success).toBe(false)
    expect(result.error).toContain('Direction must be positive/negative')
  })

  it('should reject weight out of range', () => {
    const invalidResult = {
      entities: [],
      relations: [{
        source: 'A',
        target: 'B',
        relation: 'supply_chain',
        weight: 1.5,
        direction: 'positive',
        confidence: 0.8,
        evidence: ['test']
      }],
      summary: 'test summary here'
    }

    const result = validateExtractionResult(invalidResult)
    expect(result.success).toBe(false)
    expect(result.error).toContain('Weight must be 0-1')
  })

  it('should reject empty relations evidence', () => {
    const invalidResult = {
      entities: [],
      relations: [{
        source: 'A',
        target: 'B',
        relation: 'supply_chain',
        weight: 0.5,
        direction: 'positive',
        confidence: 0.8,
        evidence: []
      }],
      summary: 'test summary here'
    }

    const result = validateExtractionResult(invalidResult)
    expect(result.success).toBe(false)
    expect(result.error).toContain('Relation evidence required')
  })

  it('should reject summary too short', () => {
    const invalidResult = {
      entities: [],
      relations: [],
      summary: 'short'
    }

    const result = validateExtractionResult(invalidResult)
    expect(result.success).toBe(false)
    expect(result.error).toContain('Summary must be 10-1000 chars')
  })

  it('should reject summary too long', () => {
    const invalidResult = {
      entities: [],
      relations: [],
      summary: 'a'.repeat(1001)
    }

    const result = validateExtractionResult(invalidResult)
    expect(result.success).toBe(false)
    expect(result.error).toContain('Summary must be 10-1000 chars')
  })

  it('should reject entity name too long', () => {
    const invalidResult = {
      entities: [{
        name: 'a'.repeat(101),
        type: 'chip_design',
        confidence: 0.9,
        evidence: ['test']
      }],
      relations: [],
      summary: 'test summary here'
    }

    const result = validateExtractionResult(invalidResult)
    expect(result.success).toBe(false)
    expect(result.error).toContain('Entity name must be 1-100 chars')
  })

  it('should reject entity description too long', () => {
    const invalidResult = {
      entities: [{
        name: 'Test',
        type: 'chip_design',
        description: 'a'.repeat(501),
        confidence: 0.9,
        evidence: ['test']
      }],
      relations: [],
      summary: 'test summary here'
    }

    const result = validateExtractionResult(invalidResult)
    expect(result.success).toBe(false)
    expect(result.error).toContain('Entity description max 500 chars')
  })

  it('should reject evidence item too long', () => {
    const invalidResult = {
      entities: [{
        name: 'Test',
        type: 'chip_design',
        confidence: 0.9,
        evidence: ['a'.repeat(201)]
      }],
      relations: [],
      summary: 'test summary here'
    }

    const result = validateExtractionResult(invalidResult)
    expect(result.success).toBe(false)
    expect(result.error).toContain('Evidence items max 200 chars')
  })

  it('should reject relation lag too long', () => {
    const invalidResult = {
      entities: [],
      relations: [{
        source: 'A',
        target: 'B',
        relation: 'supply_chain',
        weight: 0.5,
        direction: 'positive',
        confidence: 0.8,
        evidence: ['test'],
        lag: 'a'.repeat(51)
      }],
      summary: 'test summary here'
    }

    const result = validateExtractionResult(invalidResult)
    expect(result.success).toBe(false)
    expect(result.error).toContain('Relation lag max 50 chars')
  })
})
