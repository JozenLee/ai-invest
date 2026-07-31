import { describe, it, expect, beforeEach, vi } from 'vitest'
import { NewsGraphLinkerService } from '../news-graph-linker.service'
import { prisma } from '@/lib/db'

// Mock Anthropic
vi.mock('@anthropic-ai/sdk', () => ({
  default: vi.fn().mockImplementation(() => ({
    messages: {
      create: vi.fn().mockResolvedValue({
        content: [{
          type: 'text',
          text: JSON.stringify({
            matches: [
              {
                nodeId: 'node-1',
                nodeName: 'AI芯片设计',
                relevance: 0.9,
                sentiment: 'positive',
                impactType: 'direct',
                keyMentions: ['AI芯片需求增长'],
                reasoning: '新闻直接提到AI芯片设计需求'
              }
            ]
          })
        }],
        usage: {
          input_tokens: 1000,
          output_tokens: 200
        }
      })
    }
  }))
}))

// Mock prisma
vi.mock('@/lib/db', () => ({
  prisma: {
    newsArticle: {
      findUnique: vi.fn()
    },
    graphNode: {
      findMany: vi.fn(),
      update: vi.fn()
    },
    newsGraphLink: {
      deleteMany: vi.fn(),
      createMany: vi.fn(),
      count: vi.fn(),
      findMany: vi.fn(),
      findFirst: vi.fn()
    }
  }
}))

describe('NewsGraphLinkerService', () => {
  let service: NewsGraphLinkerService

  beforeEach(() => {
    vi.clearAllMocks()
    process.env.ANTHROPIC_API_KEY = 'test-key'
    service = new NewsGraphLinkerService()
  })

  describe('linkNewsToGraph', () => {
    it('应该成功关联新闻到图谱节点', async () => {
      // Mock数据
      const mockNews = {
        id: 'news-1',
        title: 'AI芯片需求激增',
        content: 'AI芯片设计公司订单爆满...',
        publishTime: new Date()
      }

      const mockNodes = [
        {
          id: 'node-1',
          name: 'AI芯片设计',
          type: 'sub_sector',
          description: 'AI芯片设计',
          level: 3
        }
      ]

      vi.mocked(prisma.newsArticle.findUnique).mockResolvedValue(mockNews as any)
      vi.mocked(prisma.graphNode.findMany).mockResolvedValue(mockNodes as any)
      vi.mocked(prisma.newsGraphLink.deleteMany).mockResolvedValue({ count: 0 } as any)
      vi.mocked(prisma.newsGraphLink.createMany).mockResolvedValue({ count: 1 } as any)
      vi.mocked(prisma.newsGraphLink.count).mockResolvedValue(1)
      vi.mocked(prisma.newsGraphLink.findMany).mockResolvedValue([
        { sentiment: 'positive', relevance: 0.9 }
      ] as any)
      vi.mocked(prisma.newsGraphLink.findFirst).mockResolvedValue({
        createdAt: new Date()
      } as any)
      vi.mocked(prisma.graphNode.update).mockResolvedValue({} as any)

      // 执行
      const result = await service.linkNewsToGraph('news-1')

      // 验证
      expect(result.newsId).toBe('news-1')
      expect(result.matches.length).toBeGreaterThan(0)
      expect(result.matches[0].nodeId).toBe('node-1')
      expect(result.tokensUsed).toBeGreaterThan(0)
      expect(prisma.newsGraphLink.createMany).toHaveBeenCalled()
    })

    it('应该在没有节点时跳过关联', async () => {
      const mockNews = {
        id: 'news-1',
        title: 'Test',
        content: 'Test content',
        publishTime: new Date()
      }

      vi.mocked(prisma.newsArticle.findUnique).mockResolvedValue(mockNews as any)
      vi.mocked(prisma.graphNode.findMany).mockResolvedValue([])

      const result = await service.linkNewsToGraph('news-1')

      expect(result.matches.length).toBe(0)
      expect(prisma.newsGraphLink.createMany).not.toHaveBeenCalled()
    })

    it('应该在新闻不存在时抛出错误', async () => {
      vi.mocked(prisma.newsArticle.findUnique).mockResolvedValue(null)

      await expect(service.linkNewsToGraph('non-existent')).rejects.toThrow(
        'News article not found'
      )
    })
  })

  describe('batchLinkNews', () => {
    it('应该批量处理多个新闻', async () => {
      const mockNews = {
        id: 'news-1',
        title: 'Test',
        content: 'Test content',
        publishTime: new Date()
      }

      const mockNodes = [
        {
          id: 'node-1',
          name: 'Test Node',
          type: 'sub_sector',
          description: 'Test',
          level: 3
        }
      ]

      vi.mocked(prisma.newsArticle.findUnique).mockResolvedValue(mockNews as any)
      vi.mocked(prisma.graphNode.findMany).mockResolvedValue(mockNodes as any)
      vi.mocked(prisma.newsGraphLink.deleteMany).mockResolvedValue({ count: 0 } as any)
      vi.mocked(prisma.newsGraphLink.createMany).mockResolvedValue({ count: 1 } as any)
      vi.mocked(prisma.newsGraphLink.count).mockResolvedValue(1)
      vi.mocked(prisma.newsGraphLink.findMany).mockResolvedValue([
        { sentiment: 'positive', relevance: 0.9 }
      ] as any)
      vi.mocked(prisma.newsGraphLink.findFirst).mockResolvedValue({
        createdAt: new Date()
      } as any)
      vi.mocked(prisma.graphNode.update).mockResolvedValue({} as any)

      const result = await service.batchLinkNews(['news-1', 'news-2'], 2)

      expect(result.total).toBe(2)
      expect(result.success).toBeGreaterThan(0)
    })
  })
})
