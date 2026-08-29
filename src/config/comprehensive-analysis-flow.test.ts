import { describe, expect, it } from 'vitest'
import { ANALYSIS_PIPELINE_STEPS, normalizeAiModuleConfig } from './comprehensive-analysis-flow'

describe('comprehensive analysis AI switches', () => {
  it('enables only explicitly configured AI modules', () => {
    const allOn = normalizeAiModuleConfig({ market: true, news: true, company: true, portfolio: true, overview: true })
    const allOff = normalizeAiModuleConfig({ market: false, news: false, company: false, portfolio: false, overview: false })
    expect(Object.values(allOn).every(Boolean)).toBe(true)
    expect(Object.values(allOff).every(Boolean)).toBe(false)
    expect(allOff.market).toBe(false)
    expect(allOff.company).toBe(false)
    expect(allOff.overview).toBe(false)
  })

  it('keeps AI switches aligned to actual AI report subprocesses', () => {
    expect(ANALYSIS_PIPELINE_STEPS.filter((step) => step.kind === 'ai').map((step) => step.id)).toEqual([
      'market.report',
      'news.impact',
      'company.report',
      'overview.ai',
    ])
  })
})
