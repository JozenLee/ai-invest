import { describe, it, expect, vi, beforeEach } from 'vitest'
import { ETFGraphAnalyzerService } from '../etf-graph-analyzer.service'
import { prisma } from '@/lib/db'

// Create a mock function that will be shared
const mockMapETFToGraph = vi.fn()

vi.mock('@/lib/db', () => ({
  prisma: {
    graphNode: {
      findMany: vi.fn()
    }
  }
}))

vi.mock('../etf-graph-mapper.service', () => {
  return {
    ETFGraphMapperService: class MockETFGraphMapperService {
      mapETFToGraph = mockMapETFToGraph
    }
  }
})

vi.mock('@anthropic-ai/sdk', () => {
  return {
    default: class MockAnthropic {
      messages = {
        create: vi.fn().mockResolvedValue({
          content: [{
            type: 'text',
            text: '["洞察1", "洞察2", "洞察3", "洞察4"]'
          }]
        })
      }
    }
  }
})

describe('ETFGraphAnalyzerService', () => {
  let service: ETFGraphAnalyzerService

  beforeEach(() => {
    vi.clearAllMocks()
    service = new ETFGraphAnalyzerService()
  })

  it('should analyze ETF with comprehensive metrics', async () => {
    const mockExposures = [
      {
        nodeId: 'node1',
        nodeName: '芯片设计',
        nodeType: 'chip_design',
        exposure: 0.3,
        stocks: []
      },
      {
        nodeId: 'node2',
        nodeName: '设备制造',
        nodeType: 'equipment',
        exposure: 0.2,
        stocks: []
      }
    ]

    const mockNodes = [
      { id: 'node1', name: '芯片设计', type: 'chip_design', cyclePos: 'upturn', momentum: 70 },
      { id: 'node2', name: '设备制造', type: 'equipment', cyclePos: 'peak', momentum: 50 },
      { id: 'node3', name: '数据中心', type: 'data_center', cyclePos: 'neutral', momentum: 30 }
    ]

    mockMapETFToGraph.mockResolvedValue(mockExposures)
    ;(prisma.graphNode.findMany as any).mockResolvedValue(mockNodes)

    const result = await service.analyze('512480')

    expect(result).toHaveProperty('coverage')
    expect(result).toHaveProperty('cycleRisk')
    expect(result).toHaveProperty('supplyChainBalance')
    expect(result).toHaveProperty('momentum')
    expect(result).toHaveProperty('insights')

    expect(result.coverage.totalNodes).toBe(3)
    expect(result.coverage.coveredNodes).toBe(2)
    expect(result.coverage.coverageRate).toBeGreaterThan(0)

    expect(result.cycleRisk.riskScore).toBeGreaterThanOrEqual(0)
    expect(result.cycleRisk.riskScore).toBeLessThanOrEqual(100)

    expect(result.insights).toHaveLength(4)
  })

  it('should handle empty exposures gracefully', async () => {
    mockMapETFToGraph.mockResolvedValue([])
    ;(prisma.graphNode.findMany as any).mockResolvedValue([
      { id: 'node1', name: '芯片设计', type: 'chip_design', cyclePos: 'neutral', momentum: 50 }
    ])

    const result = await service.analyze('999999')

    expect(result.coverage.coveredNodes).toBe(0)
    expect(result.coverage.coverageRate).toBe(0)
    expect(result.cycleRisk.upturn).toBe(0)
  })

  it('should calculate cycle risk score correctly', async () => {
    const mockExposures = [
      { nodeId: 'node1', nodeName: 'Peak Node', nodeType: 'chip_design', exposure: 0.5, stocks: [] },
      { nodeId: 'node2', nodeName: 'Downturn Node', nodeType: 'equipment', exposure: 0.3, stocks: [] }
    ]

    const mockNodes = [
      { id: 'node1', name: 'Peak Node', type: 'chip_design', cyclePos: 'peak', momentum: 70 },
      { id: 'node2', name: 'Downturn Node', type: 'equipment', cyclePos: 'downturn', momentum: 30 }
    ]

    mockMapETFToGraph.mockResolvedValue(mockExposures)
    ;(prisma.graphNode.findMany as any).mockResolvedValue(mockNodes)

    const result = await service.analyze('512480')

    // Risk score = peak * 0.6 + downturn * 0.4
    // = 0.5 * 0.6 + 0.3 * 0.4 = 0.3 + 0.12 = 0.42 = 42
    expect(result.cycleRisk.riskScore).toBe(42)
  })

  it('should detect supply chain balance', async () => {
    const mockExposures = [
      { nodeId: 'node1', nodeName: 'Upstream', nodeType: 'material', exposure: 0.3, stocks: [] },
      { nodeId: 'node2', nodeName: 'Midstream', nodeType: 'chip_design', exposure: 0.35, stocks: [] },
      { nodeId: 'node3', nodeName: 'Downstream', nodeType: 'server', exposure: 0.35, stocks: [] }
    ]

    const mockNodes = [
      { id: 'node1', name: 'Upstream', type: 'material', cyclePos: 'neutral', momentum: 50 },
      { id: 'node2', name: 'Midstream', type: 'chip_design', cyclePos: 'neutral', momentum: 50 },
      { id: 'node3', name: 'Downstream', type: 'server', cyclePos: 'neutral', momentum: 50 }
    ]

    mockMapETFToGraph.mockResolvedValue(mockExposures)
    ;(prisma.graphNode.findMany as any).mockResolvedValue(mockNodes)

    const result = await service.analyze('512480')

    expect(result.supplyChainBalance.isBalanced).toBe(true)
  })

  it('should calculate weighted momentum', async () => {
    const mockExposures = [
      { nodeId: 'node1', nodeName: 'High Momentum', nodeType: 'chip_design', exposure: 0.6, stocks: [] },
      { nodeId: 'node2', nodeName: 'Low Momentum', nodeType: 'equipment', exposure: 0.4, stocks: [] }
    ]

    const mockNodes = [
      { id: 'node1', name: 'High Momentum', type: 'chip_design', cyclePos: 'neutral', momentum: 80 },
      { id: 'node2', name: 'Low Momentum', type: 'equipment', cyclePos: 'neutral', momentum: 20 }
    ]

    mockMapETFToGraph.mockResolvedValue(mockExposures)
    ;(prisma.graphNode.findMany as any).mockResolvedValue(mockNodes)

    const result = await service.analyze('512480')

    // Weighted average = 80*0.6 + 20*0.4 = 48 + 8 = 56
    expect(result.momentum.weightedAverage).toBe(56)
  })
})
