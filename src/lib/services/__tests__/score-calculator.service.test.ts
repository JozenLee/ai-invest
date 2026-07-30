import { describe, it, expect, beforeEach } from '@jest/globals'
import { ScoreCalculatorService } from '../score-calculator.service'

describe('ScoreCalculatorService', () => {
  let service: ScoreCalculatorService

  beforeEach(() => {
    service = new ScoreCalculatorService()
  })

  describe('calculateMarketScore', () => {
    it('should return 0 when no capital flow data exists', async () => {
      const score = await service.calculateMarketScore('test_node_1')
      expect(score).toBe(0)
    })

    it('should calculate capital flow score from sector data', async () => {
      // This will need mock data - placeholder for now
      const score = await service.calculateMarketScore('ai_compute_node')
      expect(score).toBeGreaterThanOrEqual(0)
      expect(score).toBeLessThanOrEqual(50)
    })
  })

  describe('calculateNewsScore', () => {
    it('should return 0 when no news data exists', async () => {
      const score = await service.calculateNewsScore('test_node_1')
      expect(score).toBe(0)
    })

    it('should calculate news volume and sentiment score', async () => {
      const score = await service.calculateNewsScore('node_with_news')
      expect(score).toBeGreaterThanOrEqual(0)
      expect(score).toBeLessThanOrEqual(30)
    })
  })

  describe('calculateGraphScore', () => {
    it('should return 0 for isolated node', async () => {
      const score = await service.calculateGraphScore('isolated_node')
      expect(score).toBe(0)
    })

    it('should calculate degree centrality score', async () => {
      const score = await service.calculateGraphScore('connected_node')
      expect(score).toBeGreaterThanOrEqual(0)
      expect(score).toBeLessThanOrEqual(20)
    })
  })

  describe('calculateTotalScore', () => {
    it('should sum all component scores', async () => {
      const components = await service.calculateTotalScore('test_node')

      expect(components.marketFundamental).toBeGreaterThanOrEqual(0)
      expect(components.marketFundamental).toBeLessThanOrEqual(50)

      expect(components.newsSentiment).toBeGreaterThanOrEqual(0)
      expect(components.newsSentiment).toBeLessThanOrEqual(30)

      expect(components.graphStructure).toBeGreaterThanOrEqual(0)
      expect(components.graphStructure).toBeLessThanOrEqual(20)

      const total = components.marketFundamental + components.newsSentiment + components.graphStructure
      expect(total).toBeGreaterThanOrEqual(0)
      expect(total).toBeLessThanOrEqual(100)
    })
  })
})
