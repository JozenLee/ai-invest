import { describe, expect, it } from 'vitest'
import { buildFrozenGraphContext, graphCompanyCandidates, graphContextIssues, graphMappingIssues } from '../research-context'

const group = {
  id: 'industry-ai', name: 'AI算力硬件', code: 'ai_hardware',
  revision_id: 'revision-2', mapping_revision_id: 'mapping-3', version: 2, content_hash: 'graph-hash',
  source_urls: ['https://example.com/industry'],
  stages: [
    { code: 'upstream', name: '上游', segments: [{ code: 'chip', name: '芯片', companies: [{ ticker: '688001.SH', name: '芯片公司', source_urls: ['https://example.com/company'] }] }, { code: 'material', name: '材料', companies: [] }] },
    { code: 'midstream', name: '中游', segments: [{ code: 'server', name: '服务器', companies: [] }, { code: 'network', name: '网络', companies: [] }] },
    { code: 'downstream', name: '下游', segments: [{ code: 'cloud', name: '云服务', companies: [] }, { code: 'application', name: '应用', companies: [] }] },
  ],
  relations: [
    { source_code: 'chip', source_name: '芯片', target_code: 'server', target_name: '服务器', type: 'SUPPLIES', direction: 'positive', weight: 0.8, confidence: 0.9, lag: '中期', source_urls: ['https://example.com/relation'] },
    { source_code: 'server', source_name: '服务器', target_code: 'cloud', target_name: '云服务', type: 'CONSTRAINS', direction: 'negative', weight: 0.5, confidence: 0.8, source_urls: [] },
  ],
}

describe('versioned graph research context', () => {
  it('normalizes graph companies to canonical A-share codes', () => {
    expect(graphCompanyCandidates(group)).toEqual([{ code: '688001', name: '芯片公司', stage: '上游', stageCode: 'upstream', segment: '芯片', segmentCode: 'chip', evidenceUrls: ['https://example.com/company'] }])
  })

  it('freezes revision metadata and calculates bounded propagation paths', () => {
    const context = buildFrozenGraphContext(group, { fetchedAt: '2026-09-06T00:00:00Z' }, [{ id: 'event-1', title: '芯片供给变化', segments: ['chip'] }])
    expect(context.revisionId).toBe('revision-2')
    expect(context.mappingRevisionId).toBe('mapping-3')
    expect(context.mappingContentHash).toMatch(/^[a-f0-9]{64}$/)
    expect(context.coverage).toMatchObject({ stages: 3, segments: 6, companies: 1, relations: 2, evidencedRelations: 1, relationEvidencePct: 50, companySegmentCoveragePct: 100 })
    expect(context.eventMappings[0].paths).toContainEqual({ segments: ['chip', 'server', 'cloud'], segmentNames: ['芯片', '服务器', '云服务'], relationTypes: ['SUPPLIES', 'CONSTRAINS'], direction: 'negative', weight: 0.4, confidence: 0.72, lag: ['中期'], affectedCompanies: ['688001'], affectedEtfs: [] })
    expect(graphContextIssues(context)).toEqual([])
  })

  it('maps company-specific events through the company graph membership',()=>{
    const context=buildFrozenGraphContext(group,{},[{id:'event-company',title:'芯片公司调研',segments:[],companies:['688001']}])
    expect(context.eventMappings[0]).toMatchObject({directSegments:['chip'],directSegmentNames:['芯片']})
    expect(context.eventMappings[0].paths.some(path=>path.affectedCompanies.includes('688001'))).toBe(true)
  })

  it('blocks unversioned or relation-free context', () => {
    const context = buildFrozenGraphContext({ id: 'legacy', name: '旧图谱', stages: [] })
    expect(graphContextIssues(context)).toContain('产业图谱尚未发布为可追溯版本')
  })

  it('carries holding-backed company mappings into frozen graph context', () => {
    const mapped = structuredClone(group)
    Object.assign(mapped.stages[0].segments[0].companies[0], {
      match_source: 'etf_holdings',
      match_confidence: 0.91,
      representativeness_score: 0.82,
      selection_reason: '跨两只ETF持仓覆盖',
      representative_etfs: [{ code: '159001', name: '芯片ETF', relevance: 0.9, holding_verified: true }],
      representative_indices: [{ code: '931000.CSI', name: '芯片指数', relevance: 0.88 }],
    })
    Object.assign(mapped.stages[0].segments[0], {
      matched_etfs: [{ code: '159001', name: '芯片ETF', relevance: 0.9 }],
      matched_indices: [{ code: '931000.CSI', name: '芯片指数', relevance: 0.88 }],
    })
    const company = graphCompanyCandidates(mapped)[0]
    expect(company.matchSource).toBe('etf_holdings')
    expect(company.representativeEtfs).toEqual([{ code: '159001', name: '芯片ETF', relevance: 0.9, holdingVerified: true }])
    const context = buildFrozenGraphContext(mapped)
    expect(context.stages[0].segments[0].companies[0].representativenessScore).toBe(0.82)
    expect(context.etfExposure[0]).toMatchObject({ code: '159001', segments: [{ segmentCode: 'chip', matchedCompanies: ['688001'], holdingVerified: true }] })
    expect(context.coverage).toMatchObject({ segmentEtfCoveragePct: 16.7, segmentIndexCoveragePct: 16.7, companyEtfCoveragePct: 100, holdingVerifiedCoveragePct: 100 })
    expect(graphMappingIssues(context)).toEqual([])
  })
})
