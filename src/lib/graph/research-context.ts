type UnknownRow = Record<string, any>
type ResearchEventLike = { id: string; title: string; segments: string[] }

export type GraphCompanyCandidate = {
  code: string
  name: string
  segment: string
  segmentCode: string
  evidenceUrls: string[]
}

export type FrozenGraphContext = {
  revisionId: string | null
  version: number
  contentHash: string | null
  sourceFetchedAt: string | null
  industry: { id: string; code: string; name: string }
  stages: Array<{ code: string; name: string; segments: Array<{ code: string; name: string; companies: Array<{ code: string; name: string; evidenceUrls: string[] }>; etfs: Array<{ code: string; name: string }> }> }>
  relations: Array<{ sourceCode: string; sourceName: string; targetCode: string; targetName: string; type: string; direction: string; weight: number; confidence: number; lag: string | null; description: string | null; sourceUrls: string[] }>
  eventMappings: Array<{ eventId: string; title: string; directSegments: string[]; paths: Array<{ segments: string[]; relationTypes: string[]; direction: string; weight: number; confidence: number; lag: string[] }> }>
  evidenceUrls: string[]
  coverage: { stages: number; segments: number; companies: number; relations: number; evidencedRelations: number; relationEvidencePct: number }
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

const value = (row: UnknownRow, camel: string, snake: string) => row?.[camel] ?? row?.[snake]
const list = (input: unknown): UnknownRow[] => Array.isArray(input) ? input.filter((item): item is UnknownRow => !!item && typeof item === 'object') : []
const strings = (input: unknown) => Array.isArray(input) ? input.filter((item): item is string => typeof item === 'string' && !!item.trim()) : []
const stockCode = (input: unknown) => String(input || '').trim().replace(/^(sh|sz)/i, '').replace(/\.(SH|SZ)$/i, '')

function normalizedStages(group: RawGraphGroup) {
  return list(group.stages).map(stage => ({
    code: String(stage.code || ''),
    name: String(stage.name || stage.stage || ''),
    segments: list(stage.segments).map(segment => ({
      code: String(segment.code || ''),
      name: String(segment.name || ''),
      companies: list(segment.companies).flatMap(company => {
        const code = stockCode(company.ticker || company.code)
        return code ? [{ code, name: String(company.name || code), evidenceUrls: strings(value(company, 'sourceUrls', 'source_urls')) }] : []
      }),
      etfs: list(value(segment, 'matchedEtfs', 'matched_etfs')).flatMap(etf => {
        const code = stockCode(etf.code || etf.ticker)
        return code ? [{ code, name: String(etf.name || etf.etfName || code) }] : []
      }),
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
    ...company, segment: segment.name, segmentCode: segment.code,
  }))))
  const flattened = list(group.companies).flatMap(company => {
    const code = stockCode(company.ticker || company.stockCode || company.code)
    if (!code) return []
    return [{ code, name: String(company.name || code), segment: String(company.nodeName || company.segmentName || '未映射'), segmentCode: String(company.segmentCode || ''), evidenceUrls: strings(value(company, 'sourceUrls', 'source_urls')) }]
  })
  return [...new Map([...nested, ...flattened].filter(item => /^\d{6}$/.test(item.code)).map(item => [item.code, item] as const)).values()]
}

function eventPaths(events: ResearchEventLike[], stages: ReturnType<typeof normalizedStages>, relations: ReturnType<typeof normalizedRelations>) {
  const segments = stages.flatMap(stage => stage.segments)
  const aliases = new Map(segments.flatMap(segment => [[segment.code, segment.code], [segment.name, segment.code]]))
  const adjacency = new Map<string, typeof relations>()
  for (const relation of relations) adjacency.set(relation.sourceCode, [...(adjacency.get(relation.sourceCode) || []), relation])
  return events.slice(0, 24).flatMap(event => {
    const direct = [...new Set(event.segments.map(segment => aliases.get(segment)).filter((code): code is string => !!code))]
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
          paths.push({ segments: next.segments, relationTypes: next.types, direction: next.direction, weight: Number(next.weight.toFixed(4)), confidence: Number(next.confidence.toFixed(4)), lag: next.lag })
          queue.push(next)
        }
      }
    }
    return [{ eventId: event.id, title: event.title, directSegments: direct, paths: paths.sort((a, b) => b.confidence * b.weight - a.confidence * a.weight).slice(0, 12) }]
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
  const evidenceUrls = strings(value(group, 'sourceUrls', 'source_urls'))
  const evidencedRelations = relations.filter(relation => relation.sourceUrls.length).length
  return {
    revisionId: String(value(group, 'revisionId', 'revision_id') || '') || null,
    version: Number(group.version || 0),
    contentHash: String(value(group, 'contentHash', 'content_hash') || source.contentHash || '') || null,
    sourceFetchedAt: source.fetchedAt ? new Date(source.fetchedAt).toISOString() : null,
    industry: { id: group.id, code: String(group.code || ''), name: group.name },
    stages,
    relations,
    eventMappings: eventPaths(events, stages, relations),
    evidenceUrls,
    coverage: {
      stages: stages.length,
      segments: stages.reduce((sum, stage) => sum + stage.segments.length, 0),
      companies: companies.length,
      relations: relations.length,
      evidencedRelations,
      relationEvidencePct: relations.length ? Number((evidencedRelations / relations.length * 100).toFixed(1)) : 0,
    },
  }
}
