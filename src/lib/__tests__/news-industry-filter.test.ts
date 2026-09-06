import { vi, it, expect } from 'vitest'
vi.mock('@/lib/db', () => ({ prisma: {} }))
import { matchesNewsIndustry } from '../news-taxonomy'
it('matches exact classification codes, never keywords or prefixes', () => {
  const codes = new Set(['chip'])
  expect(matchesNewsIndustry('["chip"]', codes)).toBe(true)
  expect(matchesNewsIndustry('["bio_chip"]', codes)).toBe(false)
  expect(matchesNewsIndustry('["chip_design"]', codes)).toBe(false)
  expect(matchesNewsIndustry('[]', codes)).toBe(false)
  expect(matchesNewsIndustry('invalid', codes)).toBe(false)
  expect(matchesNewsIndustry(null, codes)).toBe(false)
})
