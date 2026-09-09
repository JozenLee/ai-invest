/* eslint-disable @typescript-eslint/no-explicit-any -- Versioned graph projections contain legacy camel/snake case payloads. */
import { createHash } from 'node:crypto'

type UnknownRow = Record<string, any>
type ResearchEventLike = { id: string; title: string; segments: string[];companies?:string[] }

export type GraphETFRef = {
  code: string
  name: string
  relevance: number
  holdingVerified: boolean
  evidenceId?: string
  holdingWeight?: number
  reportPeriod?: string
  source?: string
}

export type GraphIndexRef = { code: string; name: string; relevance: number; source?: string }

export type GraphCompanyCandidate = {
  code: string
  name: string
  segment?: string
  segmentCode?: string
  stage?: string
  stageCode?: string
  evidenceUrls: string[]
  representativeEtfs?: GraphETFRef[]
  representativeIndices?: GraphIndexRef[]
  matchSource?: string
  matchConfidence?: number
  representativenessScore?: number
  selectionReason?: string
}

export type FrozenGraphContext = {
  revisionId: string | null
  version: number
  contentHash: string | null
  mappingRevisionId: string | null
  mappingContentHash: string
  mappingPublishedAt: string | null
  mappingSource?: string | null
  sourceFetchedAt: string | null
  industry: { id: string; code: string; name: string }
  stages: Array<{ code: string; name: string; segments: Array<{ code: string; name: string; companies: GraphCompanyCandidate[]; etfs: GraphETFRef[]; indices: GraphIndexRef[] }> }>
  companyMappings: GraphCompanyCandidate[]
  etfExposure: Array<{ code: string; name: string; segments: Array<{ stageCode: string; stageName: string; segmentCode: string; segmentName: string; relevance: number; matchedCompanies: string[]; holdingVerified: boolean }> }>
  relations: Array<{ sourceCode: string; sourceName: string; targetCode: string; targetName: string; type: string; direction: string; weight: number; confidence: number; lag: string | null; description: string | null; sourceUrls: string[] }>
  eventMappings: Array<{ eventId: string; title: string; directSegments: string[]; directSegmentNames: string[]; paths: Array<{ segments: string[]; segmentNames: string[]; relationTypes: string[]; direction: string; weight: number; confidence: number; lag: string[]; affectedCompanies: string[]; affectedEtfs: string[] }> }>
  evidenceUrls: string[]
  coverage: { stages: number; segments: number; companies: number; relations: number; evidencedRelations: number; relationEvidencePct: number; segmentEtfCoveragePct: number; segmentIndexCoveragePct: number; companySegmentCoveragePct: number; companyEtfCoveragePct: number; holdingVerifiedCoveragePct: number }
}

export type RawGraphGroup = UnknownRow & {
  id: string
  name: string
  code?: string
  stages?: UnknownRow[]
  relations?: UnknownRow[]
  companies?: UnknownRow[]
  etfs?: UnknownRow[]
}

export function graphContextIssues(context?: FrozenGraphContext | null): string[] {
  if (!context) return ['缺少冻结的产业图谱上下文']
  const issues: string[] = []
  if (!context.revisionId || context.version < 1 || !context.contentHash) issues.push('产业图谱尚未发布为可追溯版本')
  if (context.coverage.stages < 3 || context.coverage.segments < 6) issues.push('产业图谱结构覆盖不足')
  if (context.coverage.relations < 2) issues.push('产业图谱缺少可用传导关系')
  if (context.coverage.relations && context.coverage.relationEvidencePct < 50) issues.push('产业图谱关系证据覆盖低于50%')
  return issues
}

export function graphMappingIssues(context?: FrozenGraphContext | null): string[] {
  if (!context) return ['缺少冻结的产业图谱上下文']
  const issues: string[] = []
  if (!context.mappingRevisionId) issues.push('ETF与企业匹配尚未发布独立版本')
  if (!context.coverage.segmentEtfCoveragePct) issues.push('产业环节尚未匹配ETF')
  if (!context.coverage.companySegmentCoveragePct) issues.push('图谱企业缺少产业环节归属')
  if (!context.coverage.companyEtfCoveragePct) issues.push('图谱企业尚未建立ETF暴露映射')
  return issues
}

const value = (row: UnknownRow, camel: string, snake: string) => row?.[camel] ?? row?.[snake]
const list = (input: unknown): UnknownRow[] => Array.isArray(input) ? input.filter((item): item is UnknownRow => !!item && typeof item === 'object') : []
const strings = (input: unknown) => Array.isArray(input) ? input.filter((item): item is string => typeof item === 'string' && !!item.trim()) : []
const stockCode = (input: unknown) => String(input || '').trim().replace(/^(sh|sz)/i, '').replace(/\.(SH|SZ)$/i, '')

function normalizedEtfs(input: unknown): GraphETFRef[] {
  return list(input).flatMap(etf => {
    const code = stockCode(etf.code || etf.ticker)
    if (!code) return []
    const holdingWeight = Number(value(etf, 'holdingWeight', 'holding_weight'))
    const reportPeriod = String(value(etf, 'reportPeriod', 'report_period') || '')
    const source = String(etf.source || '')
    return [{
      code,
      name: String(etf.name || etf.etfName || code),
      relevance: Math.max(0, Math.min(1, Number(etf.relevance || 0))),
      holdingVerified: Boolean(value(etf, 'holdingVerified', 'holding_verified')),
      ...(Number.isFinite(holdingWeight) ? { holdingWeight } : {}),
      ...(reportPeriod ? { reportPeriod } : {}),
      ...(etf.evidenceId ? { evidenceId: String(etf.evidenceId) } : {}),
      ...(source ? { source } : {}),
    }]
  })
}

function normalizedIndices(input: unknown): GraphIndexRef[] {
  return list(input).flatMap(index => {
    const code = String(index.code || index.indexCode || '')
    if (!code) return []
    const source = String(index.source || '')
    return [{ code, name: String(index.name || index.indexName || code), relevance: Math.max(0, Math.min(1, Number(index.relevance || 0))), ...(source ? { source } : {}) }]
  })
}

function normalizedStages(group: RawGraphGroup) {
  return list(group.stages).map(stage => ({
    code: String(stage.code || ''),
    name: String(stage.name || stage.stage || ''),
    segments: list(stage.segments).map(segment => ({
      code: String(segment.code || ''),
      name: String(segment.name || ''),
      companies: list(segment.companies).flatMap(company => {
        const code = stockCode(company.ticker || company.code)
        if (!/^\d{6}$/.test(code)) return []
        const representativeEtfs = normalizedEtfs(value(company, 'representativeEtfs', 'representative_etfs'))
        const representativeIndices = normalizedIndices(value(company, 'representativeIndices', 'representative_indices'))
        const matchSource = String(value(company, 'matchSource', 'match_source') || '')
        const matchConfidence = Number(value(company, 'matchConfidence', 'match_confidence'))
        const representativenessScore = Number(value(company, 'representativenessScore', 'representativeness_score'))
        return [{
          code,
          name: String(company.name || code),
          evidenceUrls: strings(value(company, 'sourceUrls', 'source_urls')),
          ...(representativeEtfs.length ? { representativeEtfs } : {}),
          ...(representativeIndices.length ? { representativeIndices } : {}),
          ...(matchSource ? { matchSource } : {}),
          ...(Number.isFinite(matchConfidence) ? { matchConfidence } : {}),
          ...(Number.isFinite(representativenessScore) ? { representativenessScore } : {}),
          ...(company.selectionReason || company.selection_reason ? { selectionReason: String(company.selectionReason || company.selection_reason) } : {}),
        }]
      }),
      etfs: normalizedEtfs(value(segment, 'matchedEtfs', 'matched_etfs')),
      indices: normalizedIndices(value(segment, 'matchedIndices', 'matched_indices')),
    })).filter(segment => segment.code && segment.name),
  })).filter(stage => stage.code && stage.name)
}

function normalizedRelations(group: RawGraphGroup) {
  return list(group.relations).flatMap(relation => {
    const sourceCode = String(value(relation, 'sourceCode', 'source_code') || '')
    const targetCode = String(value(relation, 'targetCode', 'target_code') || '')
    if (!sourceCode || !targetCode) return []
    return [{
      sourceCode,
      sourceName: String(value(relation, 'sourceName', 'source_name') || sourceCode),
      targetCode,
      targetName: String(value(relation, 'targetName', 'target_name') || targetCode),
      type: String(relation.type || relation.relation || 'INFLUENCES'),
      direction: String(relation.direction || (/CONSTRAINS|SUBSTITUTES/.test(String(relation.type)) ? 'negative' : 'positive')),
      weight: Math.max(0, Math.min(1, Number(relation.weight ?? 0.5))),
      confidence: Math.max(0, Math.min(1, Number(relation.confidence ?? 0.5))),
      lag: relation.lag ? String(relation.lag) : null,
      description: relation.description ? String(relation.description) : null,
      sourceUrls: strings(value(relation, 'sourceUrls', 'source_urls')),
    }]
  })
}

export function graphCompanyCandidates(group?: RawGraphGroup | null): GraphCompanyCandidate[] {
  if (!group) return []
  const stages = normalizedStages(group)
  const nested = stages.flatMap(stage => stage.segments.flatMap(segment => segment.companies.map(company => ({
    ...company, stage: stage.name, stageCode: stage.code, segment: segment.name, segmentCode: segment.code,
  }))))
  const flattened = list(group.companies).flatMap(company => {
    const code = stockCode(company.ticker || company.stockCode || company.code)
    if (!code) return []
    const representativeEtfs = normalizedEtfs(value(company, 'representativeEtfs', 'representative_etfs'))
    const representativeIndices = normalizedIndices(value(company, 'representativeIndices', 'representative_indices'))
    return [{
      code,
      name: String(company.name || code),
      segment: String(company.nodeName || company.segmentName || '未映射'),
      segmentCode: String(company.segmentCode || ''),
      evidenceUrls: strings(value(company, 'sourceUrls', 'source_urls')),
      ...(representativeEtfs.length ? { representativeEtfs } : {}),
      ...(representativeIndices.length ? { representativeIndices } : {}),
      ...(company.matchSource || company.match_source ? { matchSource: String(company.matchSource || company.match_source) } : {}),
      ...(Number.isFinite(Number(company.matchConfidence ?? company.match_confidence)) ? { matchConfidence: Number(company.matchConfidence ?? company.match_confidence) } : {}),
      ...(Number.isFinite(Number(company.representativenessScore ?? company.representativeness_score)) ? { representativenessScore: Number(company.representativenessScore ?? company.representativeness_score) } : {}),
      ...(company.selectionReason || company.selection_reason ? { selectionReason: String(company.selectionReason || company.selection_reason) } : {}),
    }]
  })
  const merged = new Map<string, GraphCompanyCandidate>()
  for (const candidate of [...flattened, ...nested].filter(item => /^\d{6}$/.test(item.code))) {
    const current = merged.get(candidate.code)
    merged.set(candidate.code, current ? {
      ...current,
      ...candidate,
      evidenceUrls: [...new Set([...current.evidenceUrls, ...candidate.evidenceUrls])],
      representativeEtfs: [...new Map([...(current.representativeEtfs || []), ...(candidate.representativeEtfs || [])].map(item => [item.code, item])).values()],
      representativeIndices: [...new Map([...(current.representativeIndices || []), ...(candidate.representativeIndices || [])].map(item => [item.code, item])).values()],
    } : candidate)
  }
  return [...merged.values()]
}

function buildEtfExposure(stages: ReturnType<typeof normalizedStages>) {
  const exposure = new Map<string, FrozenGraphContext['etfExposure'][number]>()
  for (const stage of stages) for (const segment of stage.segments) {
    const companyEtfs = segment.companies.flatMap(company => (company.representativeEtfs || []).map(etf => ({ etf, company: company.code })))
    const candidates = [...segment.etfs.map(etf => ({ etf, company: null as string | null })), ...companyEtfs]
    for (const { etf, company } of candidates) {
      const current = exposure.get(etf.code) || { code: etf.code, name: etf.name, segments: [] }
      const existing = current.segments.find(item => item.segmentCode === segment.code)
      if (existing) {
        existing.relevance = Math.max(existing.relevance, etf.relevance)
        existing.holdingVerified ||= etf.holdingVerified
        if (company && !existing.matchedCompanies.includes(company)) existing.matchedCompanies.push(company)
      } else current.segments.push({ stageCode: stage.code, stageName: stage.name, segmentCode: segment.code, segmentName: segment.name, relevance: etf.relevance, matchedCompanies: company ? [company] : [], holdingVerified: etf.holdingVerified })
      exposure.set(etf.code, current)
    }
  }
  return [...exposure.values()].sort((a, b) => b.segments.length - a.segments.length || a.code.localeCompare(b.code))
}

function eventPaths(events: ResearchEventLike[], stages: ReturnType<typeof normalizedStages>, relations: ReturnType<typeof normalizedRelations>, exposures: FrozenGraphContext['etfExposure']) {
  const segments = stages.flatMap(stage => stage.segments)
  const aliases = new Map(segments.flatMap(segment => [[segment.code, segment.code], [segment.name, segment.code]]))
  const segmentByCode = new Map(segments.map(segment => [segment.code, segment]))
  const adjacency = new Map<string, typeof relations>()
  for (const relation of relations) adjacency.set(relation.sourceCode, [...(adjacency.get(relation.sourceCode) || []), relation])
  return events.slice(0, 24).flatMap(event => {
    const affectedCompanies=new Set((event.companies||[]).map(stockCode))
    const companySegments=segments.filter(segment=>segment.companies.some(company=>affectedCompanies.has(company.code))).map(segment=>segment.code)
    const direct = [...new Set([...event.segments.map(segment => aliases.get(segment)).filter((code): code is string => !!code),...companySegments])]
    if (!direct.length) return []
    const paths: FrozenGraphContext['eventMappings'][number]['paths'] = []
    for (const source of direct) {
      const queue = [{ code: source, segments: [source], types: [] as string[], direction: 'positive', weight: 1, confidence: 1, lag: [] as string[] }]
      while (queue.length) {
        const current = queue.shift()!
        if (current.segments.length > 3) continue
        for (const relation of adjacency.get(current.code) || []) {
          if (current.segments.includes(relation.targetCode)) continue
          const negative = relation.direction === 'negative'
          const next = {
            code: relation.targetCode,
            segments: [...current.segments, relation.targetCode],
            types: [...current.types, relation.type],
            direction: negative ? (current.direction === 'negative' ? 'positive' : 'negative') : current.direction,
            weight: current.weight * relation.weight,
            confidence: current.confidence * relation.confidence,
            lag: relation.lag ? [...current.lag, relation.lag] : current.lag,
          }
          const affectedCompanies = [...new Set(next.segments.flatMap(code => segmentByCode.get(code)?.companies.map(company => company.code) || []))]
          const affectedEtfs = exposures.filter(etf => etf.segments.some(segment => next.segments.includes(segment.segmentCode))).map(etf => etf.code)
          paths.push({ segments: next.segments, segmentNames: next.segments.map(code => segmentByCode.get(code)?.name || code), relationTypes: next.types, direction: next.direction, weight: Number(next.weight.toFixed(4)), confidence: Number(next.confidence.toFixed(4)), lag: next.lag, affectedCompanies, affectedEtfs })
          queue.push(next)
        }
      }
    }
    return [{ eventId: event.id, title: event.title, directSegments: direct, directSegmentNames: direct.map(code => segmentByCode.get(code)?.name || code), paths: paths.sort((a, b) => b.confidence * b.weight - a.confidence * a.weight).slice(0, 12) }]
  })
}

export function buildFrozenGraphContext(
  group: RawGraphGroup,
  source: { fetchedAt?: Date | string | null; contentHash?: string | null } = {},
  events: ResearchEventLike[] = [],
): FrozenGraphContext {
  const stages = normalizedStages(group)
  const relations = normalizedRelations(group)
  const companies = graphCompanyCandidates(group)
  const etfExposure = buildEtfExposure(stages)
  const evidenceUrls = strings(value(group, 'sourceUrls', 'source_urls'))
  const evidencedRelations = relations.filter(relation => relation.sourceUrls.length).length
  const segments = stages.flatMap(stage => stage.segments)
  const mappedCompanies = companies.filter(company => company.segmentCode && company.segment !== '未映射')
  const companyEtfMappings = companies.filter(company => company.representativeEtfs?.length)
  const holdingVerified = companies.filter(company => company.representativeEtfs?.some(etf => etf.holdingVerified))
  const pct = (count: number, total: number) => total ? Number((count / total * 100).toFixed(1)) : 0
  const mappingPayload = stages.map(stage => ({ code: stage.code, segments: stage.segments.map(segment => ({ code: segment.code, etfs: segment.etfs, indices: segment.indices, companies: segment.companies.map(company => ({ code: company.code, representativeEtfs: company.representativeEtfs, representativeIndices: company.representativeIndices, matchSource: company.matchSource, matchConfidence: company.matchConfidence, representativenessScore: company.representativenessScore })) })) }))
  const mappingContentHash = createHash('sha256').update(JSON.stringify(mappingPayload)).digest('hex')
  return {
    revisionId: String(value(group, 'revisionId', 'revision_id') || '') || null,
    version: Number(group.version || 0),
    contentHash: String(value(group, 'contentHash', 'content_hash') || source.contentHash || '') || null,
    mappingRevisionId: String(value(group, 'mappingRevisionId', 'mapping_revision_id') || '') || null,
    mappingContentHash,
    mappingPublishedAt: String(value(group, 'mappingPublishedAt', 'mapping_published_at') || value(group, 'mappingUpdatedAt', 'mapping_updated_at') || '') || null,
    mappingSource: String(group.mappingSource||group.mapping_source||'')||null,
    sourceFetchedAt: source.fetchedAt ? new Date(source.fetchedAt).toISOString() : null,
    industry: { id: group.id, code: String(group.code || ''), name: group.name },
    stages,
    companyMappings: companies,
    etfExposure,
    relations,
    eventMappings: eventPaths(events, stages, relations, etfExposure),
    evidenceUrls,
    coverage: {
      stages: stages.length,
      segments: segments.length,
      companies: companies.length,
      relations: relations.length,
      evidencedRelations,
      relationEvidencePct: relations.length ? Number((evidencedRelations / relations.length * 100).toFixed(1)) : 0,
      segmentEtfCoveragePct: pct(segments.filter(segment => segment.etfs.length).length, segments.length),
      segmentIndexCoveragePct: pct(segments.filter(segment => segment.indices.length).length, segments.length),
      companySegmentCoveragePct: pct(mappedCompanies.length, companies.length),
      companyEtfCoveragePct: pct(companyEtfMappings.length, companies.length),
      holdingVerifiedCoveragePct: pct(holdingVerified.length, companies.length),
    },
  }
}
