import { describe, expect, it } from 'vitest'
import { buildFrozenGraphContext, graphCompanyCandidates } from '../research-context'

const group = {
  id: 'industry-ai', name: 'AI算力硬件', code: 'ai_hardware',
  revision_id: 'revision-2', version: 2, content_hash: 'graph-hash',
  source_urls: ['https://example.com/industry'],
  stages: [
    { code: 'upstream', name: '上游', segments: [{ code: 'chip', name: '芯片', companies: [{ ticker: '688001.SH', name: '芯片公司', source_urls: ['https://example.com/company'] }] }] },
    { code: 'midstream', name: '中游', segments: [{ code: 'server', name: '服务器', companies: [] }] },
    { code: 'downstream', name: '下游', segments: [{ code: 'cloud', name: '云服务', companies: [] }] },
  ],
  relations: [
    { source_code: 'chip', source_name: '芯片', target_code: 'server', target_name: '服务器', type: 'SUPPLIES', direction: 'positive', weight: 0.8, confidence: 0.9, lag: '中期', source_urls: ['https://example.com/relation'] },
    { source_code: 'server', source_name: '服务器', target_code: 'cloud', target_name: '云服务', type: 'CONSTRAINS', direction: 'negative', weight: 0.5, confidence: 0.8, source_urls: [] },
  ],
}

describe('versioned graph research context', () => {
  it('normalizes graph companies to canonical A-share codes', () => {
    expect(graphCompanyCandidates(group)).toEqual([{ code: '688001', name: '芯片公司', segment: '芯片', segmentCode: 'chip', evidenceUrls: ['https://example.com/company'] }])
  })

  it('freezes revision metadata and calculates bounded propagation paths', () => {
    const context = buildFrozenGraphContext(group, { fetchedAt: '2026-09-06T00:00:00Z' }, [{ id: 'event-1', title: '芯片供给变化', segments: ['chip'] }])
    expect(context.revisionId).toBe('revision-2')
    expect(context.coverage).toEqual({ stages: 3, segments: 3, companies: 1, relations: 2, evidencedRelations: 1, relationEvidencePct: 50 })
    expect(context.eventMappings[0].paths).toContainEqual({ segments: ['chip', 'server', 'cloud'], relationTypes: ['SUPPLIES', 'CONSTRAINS'], direction: 'negative', weight: 0.4, confidence: 0.72, lag: ['中期'] })
  })
})
