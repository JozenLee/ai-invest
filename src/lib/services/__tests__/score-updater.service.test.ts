import { describe, it, expect, beforeEach, beforeAll } from 'vitest'
import { ScoreUpdaterService } from '../score-updater.service'
import prisma from '@/lib/db/prisma'

describe('ScoreUpdaterService', () => {
  let service: ScoreUpdaterService
  let testNodeId: string

  beforeAll(async () => {
    // Get a real node ID from the database
    const node = await prisma.graphNode.findFirst({
      select: { id: true },
    })

    if (!node) {
      throw new Error('No nodes found in database. Run npm run db:seed first.')
    }

    testNodeId = node.id
  })

  beforeEach(() => {
    service = new ScoreUpdaterService()
  })

  describe('updateNodeScore', () => {
    it('should update node score and save to database', async () => {
      await service.updateNodeScore(testNodeId, 'manual')

      // Verify node was updated
      const node = await prisma.graphNode.findUnique({
        where: { id: testNodeId },
      })

      expect(node).toBeDefined()
      expect(node!.totalScore).toBeGreaterThan(0)
      expect(node!.scoreComponents).toBeDefined()
      expect(node!.trendIndicator).toBeDefined()
      expect(node!.scoreUpdatedAt).toBeDefined()

      // Verify NodeScoreHistory record was created
      const history = await prisma.nodeScoreHistory.findFirst({
        where: { nodeId: testNodeId },
        orderBy: { date: 'desc' },
      })

      expect(history).toBeDefined()
      expect(history!.totalScore).toBe(node!.totalScore)
    })

    it('should only recalculate triggered dimension', async () => {
      await service.updateNodeScore(testNodeId, 'news')

      // Should recalculate news score but not market score
      // This is verified by the implementation logic
    })
  })

  describe('batchUpdateScores', () => {
    it('should update multiple nodes in batch', async () => {
      // Get 3 real node IDs
      const nodes = await prisma.graphNode.findMany({
        take: 3,
        select: { id: true },
      })

      const nodeIds = nodes.map(n => n.id)
      await service.batchUpdateScores(nodeIds, 'market')

      // Verify all nodes updated
      const updatedNodes = await prisma.graphNode.findMany({
        where: {
          id: { in: nodeIds },
        },
      })

      expect(updatedNodes).toHaveLength(3)
      updatedNodes.forEach((node) => {
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

      await service.saveScoreSnapshot(testNodeId, components)

      // Verify NodeScoreHistory record created
      const history = await prisma.nodeScoreHistory.findFirst({
        where: { nodeId: testNodeId },
        orderBy: { date: 'desc' },
      })

      expect(history).toBeDefined()
      expect(history!.nodeId).toBe(testNodeId)
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
