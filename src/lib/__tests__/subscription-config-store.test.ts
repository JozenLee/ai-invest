import { beforeEach, describe, expect, it, vi } from 'vitest'

const findUnique = vi.hoisted(() => vi.fn())
vi.mock('@/lib/db', () => ({ prisma: { subscriptionConfiguration: { findUnique } } }))
import { getSubscriptionConfig } from '@/lib/subscription-config-store'

describe('persisted subscription config migration', () => {
  beforeEach(() => findUnique.mockReset())

  it('keeps newly introduced scopes and policies enabled when an older payload is loaded', async () => {
    findUnique.mockResolvedValue({ payload: JSON.stringify({
      historyPoints: 120,
      scopeEnabled: { market_index: true, etf_index: true, company_quote: true },
      policies: {},
    }) })
    const config = await getSubscriptionConfig()
    expect(config.scopeEnabled.portfolio_fund).toBe(true)
    expect(config.policies.fund_research).toMatchObject({ scope: 'portfolio_fund', enabled: true })
  })
})
