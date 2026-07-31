import { describe, it, expect, beforeEach, vi } from 'vitest'
import { GraphStateUpdaterService } from '../graph-state-updater.service'
import { prisma } from '@/lib/db'

// Mock prisma
vi.mock('@/lib/db', () => ({
  prisma: {
    graphNode: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
      update: vi.fn()
    }
  }
}))

describe('GraphStateUpdaterService', () => {
  let service: GraphStateUpdaterService

  beforeEach(() => {
    vi.clearAllMocks()
    service = new GraphStateUpdaterService()
  })

  describe('updateNodeState', () => {
    it('应该正确计算节点动量和周期位置', async () => {
      const mockNode = {
        id: 'node-1',
        name: 'AI芯片',
        type: 'sub_sector',
        momentum: 30,
        cyclePos: 'neutral',
        newsCount7d: 10,
        newsCount30d: 20,
        sentimentScore: 0.5,
        newsLinks: []
      }

      vi.mocked(prisma.graphNode.update).mockResolvedValue(mockNode as any)

      const result = await service.updateNodeState(mockNode)

      expect(result.nodeId).toBe('node-1')
      expect(typeof result.newMomentum).toBe('number')
      expect(result.newMomentum).toBeGreaterThanOrEqual(-100)
      expect(result.newMomentum).toBeLessThanOrEqual(100)
      expect(['upturn', 'peak', 'downturn', 'trough', 'neutral']).toContain(result.newCyclePos)
      expect(prisma.graphNode.update).toHaveBeenCalledWith({
        where: { id: 'node-1' },
        data: {
          momentum: expect.any(Number),
          cyclePos: expect.any(String)
        }
      })
    })

    it('应该在新闻增长时给出正动量', async () => {
      const mockNode = {
        id: 'node-1',
        name: 'AI芯片',
        type: 'sub_sector',
        momentum: 0,
        cyclePos: 'neutral',
        newsCount7d: 20, // 高于平均水平
        newsCount30d: 40,
        sentimentScore: 0.3,
        newsLinks: []
      }

      vi.mocked(prisma.graphNode.update).mockResolvedValue(mockNode as any)

      const result = await service.updateNodeState(mockNode)

      expect(result.newMomentum).toBeGreaterThan(0)
    })

    it('应该在新闻减少时给出负动量', async () => {
      const mockNode = {
        id: 'node-1',
        name: 'AI芯片',
        type: 'sub_sector',
        momentum: 50,
        cyclePos: 'peak',
        newsCount7d: 2, // 低于平均水平
        newsCount30d: 40,
        sentimentScore: -0.2,
        newsLinks: []
      }

      vi.mocked(prisma.graphNode.update).mockResolvedValue(mockNode as any)

      const result = await service.updateNodeState(mockNode)

      expect(result.newMomentum).toBeLessThan(0)
    })
  })

  describe('updateAllNodeStates', () => {
    it('应该更新所有非指数节点', async () => {
      const mockNodes = [
        {
          id: 'node-1',
          name: 'Node 1',
          type: 'sub_sector',
          momentum: 0,
          cyclePos: 'neutral',
          newsCount7d: 10,
          newsCount30d: 20,
          sentimentScore: 0.5,
          newsLinks: []
        },
        {
          id: 'node-2',
          name: 'Node 2',
          type: 'industry_l1',
          momentum: 20,
          cyclePos: 'upturn',
          newsCount7d: 5,
          newsCount30d: 15,
          sentimentScore: 0.3,
          newsLinks: []
        }
      ]

      vi.mocked(prisma.graphNode.findMany).mockResolvedValue(mockNodes as any)
      vi.mocked(prisma.graphNode.update).mockResolvedValue({} as any)

      const result = await service.updateAllNodeStates()

      expect(result.total).toBe(2)
      expect(result.updated).toBe(2)
      expect(result.failed).toBe(0)
      expect(prisma.graphNode.update).toHaveBeenCalledTimes(2)
    })
  })

  describe('updateNodes', () => {
    it('应该更新指定的节点列表', async () => {
      const mockNode = {
        id: 'node-1',
        name: 'AI芯片',
        type: 'sub_sector',
        momentum: 0,
        cyclePos: 'neutral',
        newsCount7d: 10,
        newsCount30d: 20,
        sentimentScore: 0.5,
        newsLinks: []
      }

      vi.mocked(prisma.graphNode.findUnique).mockResolvedValue(mockNode as any)
      vi.mocked(prisma.graphNode.update).mockResolvedValue(mockNode as any)

      const result = await service.updateNodes(['node-1'])

      expect(result.length).toBe(1)
      expect(result[0].nodeId).toBe('node-1')
      expect(prisma.graphNode.findUnique).toHaveBeenCalledWith({
        where: { id: 'node-1' },
        include: {
          newsLinks: {
            orderBy: { createdAt: 'desc' },
            take: 30
          }
        }
      })
    })
  })
})
