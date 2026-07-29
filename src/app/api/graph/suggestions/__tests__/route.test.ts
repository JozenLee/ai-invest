// src/app/api/graph/suggestions/__tests__/route.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { GET, POST } from '../route'
import { PATCH } from '../[id]/route'
import prisma from '@/lib/db/prisma'

describe('Suggestions API', () => {
  let testSuggestionIds: string[] = []

  beforeEach(async () => {
    // Create test suggestions
    const s1 = await prisma.graphSuggestion.create({
      data: {
        type: 'add_node',
        targetType: 'node',
        data: JSON.stringify({ name: 'Node1', type: 'chip_design', level: 3 }),
        confidence: 0.95,
        source: 'ai_extraction',
        status: 'pending'
      }
    })

    const s2 = await prisma.graphSuggestion.create({
      data: {
        type: 'add_node',
        targetType: 'node',
        data: JSON.stringify({ name: 'Node2', type: 'memory', level: 3 }),
        confidence: 0.65,
        source: 'ai_extraction',
        status: 'pending'
      }
    })

    testSuggestionIds = [s1.id, s2.id]
  })

  afterEach(async () => {
    await prisma.graphNode.deleteMany({})
    await prisma.graphSuggestion.deleteMany({})
  })

  describe('GET /api/graph/suggestions', () => {
    it('should return suggestions list', async () => {
      const request = new Request('http://localhost/api/graph/suggestions')
      const response = await GET(request)
      const data = await response.json()

      expect(response.status).toBe(200)
      expect(data.success).toBe(true)
      expect(data.data.suggestions).toHaveLength(2)
    })

    it('should filter by confidence', async () => {
      const request = new Request(
        'http://localhost/api/graph/suggestions?minConfidence=0.8'
      )
      const response = await GET(request)
      const data = await response.json()

      expect(data.data.suggestions).toHaveLength(1)
      expect(data.data.suggestions[0].confidence).toBeGreaterThanOrEqual(0.8)
    })

    it('should filter by status', async () => {
      const request = new Request(
        'http://localhost/api/graph/suggestions?status=pending'
      )
      const response = await GET(request)
      const data = await response.json()

      expect(data.data.suggestions.every((s: any) => s.status === 'pending')).toBe(true)
    })
  })

  describe('POST /api/graph/suggestions/batch', () => {
    it('should batch approve suggestions', async () => {
      const request = new Request('http://localhost/api/graph/suggestions/batch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'approve',
          suggestionIds: testSuggestionIds,
          reviewedBy: 'test-user'
        })
      })

      const response = await POST(request)
      const data = await response.json()

      expect(response.status).toBe(200)
      expect(data.success).toBe(true)
      expect(data.data.approvedCount).toBe(2)

      // Verify nodes created
      const nodes = await prisma.graphNode.findMany({
        where: { name: { in: ['Node1', 'Node2'] } }
      })
      expect(nodes).toHaveLength(2)
    })

    it('should batch reject suggestions', async () => {
      const request = new Request('http://localhost/api/graph/suggestions/batch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'reject',
          suggestionIds: testSuggestionIds,
          reviewedBy: 'test-user',
          note: '批量拒绝测试'
        })
      })

      const response = await POST(request)
      const data = await response.json()

      expect(response.status).toBe(200)
      expect(data.data.rejectedCount).toBe(2)
    })
  })

  describe('PATCH /api/graph/suggestions/[id]', () => {
    it('should approve single suggestion', async () => {
      const request = new Request(
        `http://localhost/api/graph/suggestions/${testSuggestionIds[0]}`,
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            action: 'approve',
            reviewedBy: 'test-user'
          })
        }
      )

      const response = await PATCH(request, {
        params: { id: testSuggestionIds[0] }
      })
      const data = await response.json()

      expect(response.status).toBe(200)
      expect(data.success).toBe(true)

      const suggestion = await prisma.graphSuggestion.findUnique({
        where: { id: testSuggestionIds[0] }
      })
      expect(suggestion?.status).toBe('applied')
    })

    it('should reject single suggestion with note', async () => {
      const request = new Request(
        `http://localhost/api/graph/suggestions/${testSuggestionIds[1]}`,
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            action: 'reject',
            reviewedBy: 'test-user',
            note: '置信度不足'
          })
        }
      )

      const response = await PATCH(request, {
        params: { id: testSuggestionIds[1] }
      })

      const suggestion = await prisma.graphSuggestion.findUnique({
        where: { id: testSuggestionIds[1] }
      })
      expect(suggestion?.status).toBe('rejected')
      expect(suggestion?.reviewNote).toBe('置信度不足')
    })
  })
})
