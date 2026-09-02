import { describe, expect, it } from 'vitest'
import { DEFAULT_DATASETS, normalizeInstrumentCode } from '@/lib/data-subscriptions'

describe('data subscription contracts', () => {
  it('normalizes A-share ETF codes', () => {
    expect(normalizeInstrumentCode('sh159995')).toBe('159995')
    expect(normalizeInstrumentCode(' SZ512480 ')).toBe('512480')
  })

  it('provides the expected default ETF datasets', () => {
    expect(DEFAULT_DATASETS.map((item) => item.datasetKey)).toEqual([
      'etf_realtime',
      'etf_daily',
      'etf_holdings',
      'constituent_stock_realtime',
      'stock_financial',
      'stock_announcement',
    ])
    expect(DEFAULT_DATASETS.find((item) => item.datasetKey === 'etf_holdings')?.closedIntervalSeconds).toBe(86400)
  })
})
