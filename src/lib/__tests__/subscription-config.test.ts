import { describe, expect, it } from 'vitest'
import { DEFAULT_SUBSCRIPTION_CONFIG, SUBSCRIPTION_ANALYSIS_USAGE, validateSubscriptionConfig } from '@/lib/subscription-config'

describe('subscription configuration', () => {
  it('uses one 120-point rule and independent efficient policies', () => {
    expect(DEFAULT_SUBSCRIPTION_CONFIG.historyPoints).toBe(120)
    expect(DEFAULT_SUBSCRIPTION_CONFIG.policies.constituent_stock_realtime.tradingIntervalSeconds).toBe(60)
    expect(DEFAULT_SUBSCRIPTION_CONFIG.policies.constituent_stock_daily.dailyTimes).toEqual(['12:10', '16:30'])
    expect(DEFAULT_SUBSCRIPTION_CONFIG.policies.stock_financial.dailyTimes).toHaveLength(1)
    expect(DEFAULT_SUBSCRIPTION_CONFIG.policies.stock_announcement.dailyTimes).toHaveLength(1)
    expect(DEFAULT_SUBSCRIPTION_CONFIG.policies.research_calendar.enabled).toBe(true)
    expect(DEFAULT_SUBSCRIPTION_CONFIG.policies.etf_research.enabled).toBe(true)
    expect(DEFAULT_SUBSCRIPTION_CONFIG.scopeEnabled.portfolio_fund).toBe(true)
    expect(DEFAULT_SUBSCRIPTION_CONFIG.policies.fund_research.scope).toBe('portfolio_fund')
    expect(Object.keys(DEFAULT_SUBSCRIPTION_CONFIG.policies).every(key => Boolean(SUBSCRIPTION_ANALYSIS_USAGE[key]))).toBe(true)
  })
  it('validates bounds and daily schedules', () => {
    expect(validateSubscriptionConfig(DEFAULT_SUBSCRIPTION_CONFIG)).toEqual(DEFAULT_SUBSCRIPTION_CONFIG)
    expect(() => validateSubscriptionConfig({ ...DEFAULT_SUBSCRIPTION_CONFIG, historyPoints: 20 })).toThrow('60–500')
    const invalid = structuredClone(DEFAULT_SUBSCRIPTION_CONFIG)
    invalid.policies.etf_daily.dailyTimes = ['25:00']
    expect(() => validateSubscriptionConfig(invalid)).toThrow('HH:mm')
  })
})
