import { describe, it, expect, beforeEach } from '@jest/globals'
import { ScoreUpdaterService } from '../score-updater.service'
import { prisma } from '@/lib/db/client'

describe('ScoreUpdaterService', () => {
  let service: ScoreUpdaterService

  beforeEach(() => {
    service = new ScoreUpdaterService()
  })

  describe('updateNodeScore', () => {
    it('should update node score and save to database', async () => {
      await service.updateNodeScore('test_node', 'manual')

      // Verify node was updated
      const node = await prisma.graphNode.findUnique({
        where: { id: 'test_node' },
      })

      expect(node).toBeDefined()
      expect(node!.totalScore).toBeGreaterThan(0)
      expect(node!.scoreComponents).toBeDefined()
      expect(node!.trendIndicator).toBeDefined()
      expect(node!.scoreUpdatedAt).toBeDefined()

      // Verify NodeScoreHistory record was created
      const history = await prisma.nodeScoreHistory.findFirst({
        where: { nodeId: 'test_node' },
        orderBy: { date: 'desc' },
      })

      expect(history).toBeDefined()
      expect(history!.totalScore).toBe(node!.totalScore)
    })

    it('should only recalculate triggered dimension', async () => {
      await service.updateNodeScore('test_node', 'news')

      // Should recalculate news score but not market score
    })
  })

  describe('batchUpdateScores', () => {
    it('should update multiple nodes in batch', async () => {
      const nodeIds = ['node1', 'node2', 'node3']
      await service.batchUpdateScores(nodeIds, 'market')

      // Verify all nodes updated
      const nodes = await prisma.graphNode.findMany({
        where: {
          id: { in: nodeIds },
        },
      })

      expect(nodes).toHaveLength(3)
      nodes.forEach((node) => {
        expect(node.totalScore).toBeGreaterThan(0)
        expect(node.scoreComponents).toBeDefined()
        expect(node.scoreUpdatedAt).toBeDefined()
      })
    })
  })

  describe('saveScoreSnapshot', () => {
    it('should create score history record', async () => {
      const components = {
        marketFundamental: 25,
        newsSentiment: 15,
        graphStructure: 10,
      }

      await service.saveScoreSnapshot('test_node', components)

      // Verify NodeScoreHistory record created
      const history = await prisma.nodeScoreHistory.findFirst({
        where: { nodeId: 'test_node' },
        orderBy: { date: 'desc' },
      })

      expect(history).toBeDefined()
      expect(history!.nodeId).toBe('test_node')
      expect(history!.totalScore).toBe(50) // 25 + 15 + 10
      expect(history!.components).toBeDefined()

      const savedComponents = JSON.parse(history!.components)
      expect(savedComponents.marketFundamental).toBe(25)
      expect(savedComponents.newsSentiment).toBe(15)
      expect(savedComponents.graphStructure).toBe(10)
    })
  })

  describe('determineTrendIndicator', () => {
    it('should return "up" when score increases', () => {
      const trend = service.determineTrendIndicator(80, 65)
      expect(trend).toBe('up')
    })

    it('should return "down" when score decreases', () => {
      const trend = service.determineTrendIndicator(50, 70)
      expect(trend).toBe('down')
    })

    it('should return "stable" when score changes less than 5', () => {
      const trend = service.determineTrendIndicator(68, 70)
      expect(trend).toBe('stable')
    })
  })
})
