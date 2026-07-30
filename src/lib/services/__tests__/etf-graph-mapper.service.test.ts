import { describe, it, expect, beforeEach } from 'vitest'
import { ETFGraphMapperService } from '../etf-graph-mapper.service'

describe('ETFGraphMapperService', () => {
  let service: ETFGraphMapperService

  beforeEach(() => {
    service = new ETFGraphMapperService()
  })

  it('should map ETF holdings to graph nodes', async () => {
    // This is an integration test that requires:
    // 1. Python data service running
    // 2. GraphStock seed data
    // Skip if not in integration test mode
    if (!process.env.RUN_INTEGRATION_TESTS) {
      return
    }

    const exposures = await service.mapETFToGraph('512480')

    expect(exposures.length).toBeGreaterThan(0)
    expect(exposures[0]).toHaveProperty('nodeId')
    expect(exposures[0]).toHaveProperty('exposure')
    expect(exposures[0].stocks.length).toBeGreaterThan(0)
  })
})
