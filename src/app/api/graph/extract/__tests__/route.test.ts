// src/app/api/graph/extract/__tests__/route.test.ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { NextRequest } from 'next/server'

// Set API key before any imports that create singletons
process.env.ANTHROPIC_API_KEY = 'mock-api-key'

import { POST } from '../route'
import prisma from '@/lib/db/prisma'

// Mock Anthropic client
const mockCreate = vi.fn()

vi.mock('@anthropic-ai/sdk', () => {
  return {
    default: class MockAnthropic {
      messages = {
        create: mockCreate
      }
    }
  }
})

describe('POST /api/graph/extract', () => {
  beforeEach(() => {
    vi.clearAllMocks()

    // Set API key for singleton instance
    process.env.ANTHROPIC_API_KEY = 'mock-api-key'

    // Mock successful extraction response
    mockCreate.mockImplementation(async (params: any) => {
      // Check for empty text after "文本内容："
      const content = params.messages?.[0]?.content || ''
      const textMatch = content.match(/文本内容：\s*\n\s*请识别：/)

      if (textMatch) {
        // Empty or whitespace-only text detected
        throw new Error('Cannot extract from empty text')
      }

      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            entities: [{
              name: 'NVIDIA',
              type: 'chip_design',
              description: 'GPU设计公司',
              confidence: 0.95,
              evidence: ['文中明确提到NVIDIA']
            }],
            relations: [{
              source: 'NVIDIA',
              target: 'TSMC',
              relation: 'supply_chain',
              weight: 0.9,
              direction: 'positive',
              confidence: 0.88,
              evidence: ['NVIDIA芯片由TSMC代工'],
              lag: '1-2个月'
            }],
            summary: 'NVIDIA与TSMC的供应链关系'
          })
        }],
        usage: { input_tokens: 100, output_tokens: 200 }
      }
    })
  })

  afterEach(async () => {
    await prisma.graphSuggestion.deleteMany({})
    await prisma.graphExtractionJob.deleteMany({})
  })

  it('should create extraction job and return job ID', async () => {
    const request = new NextRequest('http://localhost/api/graph/extract', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        text: 'NVIDIA是GPU设计领域的领导者，其芯片由TSMC代工生产。',
        type: 'news',
        metadata: {
          title: '测试新闻',
          source: '测试来源'
        }
      })
    })

    const response = await POST(request)
    const data = await response.json()

    expect(response.status).toBe(200)
    expect(data.success).toBe(true)
    expect(data.data.jobId).toBeDefined()

    // Verify job created
    const job = await prisma.graphExtractionJob.findUnique({
      where: { id: data.data.jobId }
    })
    expect(job).toBeDefined()
    expect(job?.status).toBe('completed')
  })

  it('should return 400 for invalid input', async () => {
    const request = new NextRequest('http://localhost/api/graph/extract', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        // missing text
        type: 'news'
      })
    })

    const response = await POST(request)
    expect(response.status).toBe(400)
  })

  it('should handle extraction errors gracefully', async () => {
    const request = new NextRequest('http://localhost/api/graph/extract', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        text: '', // empty text will cause error
        type: 'news'
      })
    })

    const response = await POST(request)
    const data = await response.json()

    expect(response.status).toBe(200)
    expect(data.success).toBe(true)

    const job = await prisma.graphExtractionJob.findUnique({
      where: { id: data.data.jobId }
    })
    expect(job?.status).toBe('failed')
    expect(job?.errorMessage).toBeDefined()
  })
})
