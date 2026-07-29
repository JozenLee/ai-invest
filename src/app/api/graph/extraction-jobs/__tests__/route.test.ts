// src/app/api/graph/extraction-jobs/__tests__/route.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { GET } from '../route'
import prisma from '@/lib/db/prisma'

describe('GET /api/graph/extraction-jobs', () => {
  beforeEach(async () => {
    // Create test jobs
    await prisma.graphExtractionJob.create({
      data: {
        sourceType: 'news',
        status: 'completed',
        suggestionsCreated: 5,
        tokensUsed: 1000,
        durationMs: 2000
      }
    })

    await prisma.graphExtractionJob.create({
      data: {
        sourceType: 'report',
        status: 'processing'
      }
    })

    await prisma.graphExtractionJob.create({
      data: {
        sourceType: 'news',
        status: 'failed',
        errorMessage: 'Test error'
      }
    })
  })

  afterEach(async () => {
    await prisma.graphExtractionJob.deleteMany({})
  })

  it('should return all jobs by default', async () => {
    const request = new Request('http://localhost/api/graph/extraction-jobs')
    const response = await GET(request)
    const data = await response.json()

    expect(response.status).toBe(200)
    expect(data.success).toBe(true)
    expect(data.data.jobs).toHaveLength(3)
  })

  it('should filter by status', async () => {
    const request = new Request(
      'http://localhost/api/graph/extraction-jobs?status=completed'
    )
    const response = await GET(request)
    const data = await response.json()

    expect(data.data.jobs).toHaveLength(1)
    expect(data.data.jobs[0].status).toBe('completed')
  })

  it('should filter by sourceType', async () => {
    const request = new Request(
      'http://localhost/api/graph/extraction-jobs?sourceType=news'
    )
    const response = await GET(request)
    const data = await response.json()

    expect(data.data.jobs).toHaveLength(2)
    expect(data.data.jobs.every((j: any) => j.sourceType === 'news')).toBe(true)
  })

  it('should limit results', async () => {
    const request = new Request(
      'http://localhost/api/graph/extraction-jobs?limit=2'
    )
    const response = await GET(request)
    const data = await response.json()

    expect(data.data.jobs).toHaveLength(2)
  })

  it('should return statistics', async () => {
    const request = new Request('http://localhost/api/graph/extraction-jobs')
    const response = await GET(request)
    const data = await response.json()

    expect(data.data.stats).toBeDefined()
    expect(data.data.stats.total).toBe(3)
    expect(data.data.stats.completed).toBe(1)
    expect(data.data.stats.processing).toBe(1)
    expect(data.data.stats.failed).toBe(1)
  })
})
