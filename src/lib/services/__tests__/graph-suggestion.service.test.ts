import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { graphSuggestionService } from '../graph-suggestion.service'
import prisma from '@/lib/db/prisma'

describe('GraphSuggestionService', () => {
  let testJobId: string
  let testSuggestionId: string

  beforeEach(async () => {
    // Create test extraction job
    const job = await prisma.graphExtractionJob.create({
      data: {
        sourceType: 'news',
        status: 'completed'
      }
    })
    testJobId = job.id
  })

  afterEach(async () => {
    // Clean up
    await prisma.graphSuggestion.deleteMany({})
    await prisma.graphExtractionJob.deleteMany({})
  })

  it('should create suggestions from extraction result', async () => {
    const extraction = {
      entities: [{
        name: 'NVIDIA',
        type: 'chip_design' as const,
        description: 'GPU公司',
        confidence: 0.95,
        evidence: ['文中提到']
      }],
      relations: [{
        source: 'NVIDIA',
        target: 'TSMC',
        relation: 'supply_chain' as const,
        weight: 0.9,
        direction: 'positive' as const,
        confidence: 0.88,
        evidence: ['代工关系']
      }],
      summary: 'test'
    }

    const count = await graphSuggestionService.createFromExtraction(testJobId, extraction)

    expect(count).toBe(2) // 1 entity + 1 relation

    const suggestions = await prisma.graphSuggestion.findMany({})
    expect(suggestions).toHaveLength(2)

    const entitySuggestion = suggestions.find(s => s.type === 'add_node')
    expect(entitySuggestion).toBeDefined()
    expect(entitySuggestion?.confidence).toBe(0.95)
  })

  it('should approve suggestion and apply to graph', async () => {
    // Create test suggestion
    const suggestion = await prisma.graphSuggestion.create({
      data: {
        type: 'add_node',
        targetType: 'node',
        data: JSON.stringify({
          name: 'TestNode',
          type: 'chip_design',
          description: 'Test',
          level: 3
        }),
        confidence: 0.9,
        source: 'ai_extraction',
        status: 'pending'
      }
    })

    await graphSuggestionService.approveSuggestion(suggestion.id, 'test-user')

    // Check suggestion status
    const updated = await prisma.graphSuggestion.findUnique({
      where: { id: suggestion.id }
    })
    expect(updated?.status).toBe('applied')
    expect(updated?.reviewedBy).toBe('test-user')

    // Check node created
    const node = await prisma.graphNode.findFirst({
      where: { name: 'TestNode' }
    })
    expect(node).toBeDefined()

    // Check change log
    const log = await prisma.graphChangeLog.findFirst({
      where: { nodeId: node?.id }
    })
    expect(log).toBeDefined()
    expect(log?.action).toBe('add_node')
  })

  it('should batch approve multiple suggestions', async () => {
    // Create multiple suggestions
    const s1 = await prisma.graphSuggestion.create({
      data: {
        type: 'add_node',
        targetType: 'node',
        data: JSON.stringify({ name: 'Node1', type: 'chip_design', level: 3 }),
        confidence: 0.9,
        source: 'ai_extraction',
        status: 'pending'
      }
    })

    const s2 = await prisma.graphSuggestion.create({
      data: {
        type: 'add_node',
        targetType: 'node',
        data: JSON.stringify({ name: 'Node2', type: 'memory', level: 3 }),
        confidence: 0.85,
        source: 'ai_extraction',
        status: 'pending'
      }
    })

    const count = await graphSuggestionService.batchApprove([s1.id, s2.id], 'test-user')
    expect(count).toBe(2)

    const nodes = await prisma.graphNode.findMany({
      where: { name: { in: ['Node1', 'Node2'] } }
    })
    expect(nodes).toHaveLength(2)
  })

  it('should reject suggestion', async () => {
    const suggestion = await prisma.graphSuggestion.create({
      data: {
        type: 'add_node',
        targetType: 'node',
        data: JSON.stringify({ name: 'BadNode', type: 'chip_design', level: 3 }),
        confidence: 0.5,
        source: 'ai_extraction',
        status: 'pending'
      }
    })

    await graphSuggestionService.rejectSuggestion(
      suggestion.id,
      'test-user',
      '置信度太低'
    )

    const updated = await prisma.graphSuggestion.findUnique({
      where: { id: suggestion.id }
    })
    expect(updated?.status).toBe('rejected')
    expect(updated?.reviewNote).toBe('置信度太低')

    // Node should not be created
    const node = await prisma.graphNode.findFirst({
      where: { name: 'BadNode' }
    })
    expect(node).toBeNull()
  })
})
