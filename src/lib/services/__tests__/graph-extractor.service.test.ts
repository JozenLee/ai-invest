import { describe, it, expect, vi, beforeEach } from 'vitest'
import { graphExtractorService, GraphExtractorService } from '../graph-extractor.service'

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

describe('GraphExtractorService', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('should extract entities and relations from text', async () => {
    // Mock Claude response
    const mockResponse = {
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

    mockCreate.mockResolvedValue(mockResponse)

    const service = new GraphExtractorService('mock-api-key')
    const result = await service.extract({
      text: 'NVIDIA是GPU设计领域的领导者，其芯片由TSMC代工生产。',
      type: 'news'
    })

    expect(result.entities).toHaveLength(1)
    expect(result.entities[0].name).toBe('NVIDIA')
    expect(result.relations).toHaveLength(1)
    expect(result.metadata.tokensUsed).toBe(300)
  })

  it('should throw error on invalid extraction result', async () => {
    const mockResponse = {
      content: [{
        type: 'text',
        text: JSON.stringify({
          entities: [],
          relations: [],
          // missing summary
        })
      }],
      usage: { input_tokens: 50, output_tokens: 10 }
    }

    mockCreate.mockResolvedValue(mockResponse)

    const service = new GraphExtractorService('mock-api-key')
    await expect(service.extract({
      text: 'test',
      type: 'news'
    })).rejects.toThrow('Summary required')
  })

  it('should use singleton instance', () => {
    // Set env var for singleton
    process.env.ANTHROPIC_API_KEY = 'mock-api-key'
    const instance = graphExtractorService
    expect(instance).toBeDefined()
    expect(typeof (instance as any).extract).toBe('function')
  })
})
