/** A compact, explicit cross-domain packet. Raw event bodies and repeated graph trees
 * belong to upstream analysis; synthesis receives their conclusions and dated sources. */
type Row = Record<string, unknown>
const row = (value: unknown): Row => {
  if (typeof value === 'string') { try { return row(JSON.parse(value)) } catch { return {} } }
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Row : {}
}
const list = (value: unknown) => Array.isArray(value) ? value : []
const text = (value: unknown, limit = 180) => typeof value === 'string' ? value.slice(0, limit) : value
const pick = (value: unknown, keys: string[]) => Object.fromEntries(keys.filter(key => row(value)[key] != null).map(key => [key, row(value)[key]]))
const referencedEvidenceIds = (value: unknown, ids = new Set<string>()): Set<string> => {
  if (Array.isArray(value)) value.forEach(item => referencedEvidenceIds(item, ids))
  else if (value && typeof value === 'object') for (const [key, item] of Object.entries(value)) {
    if (key === 'evidenceIds' && Array.isArray(item)) item.filter(id => typeof id === 'string').forEach(id => ids.add(id))
    else if (['evidenceId','factId','actualFactId','consensusFactId'].includes(key) && typeof item === 'string') ids.add(item)
    else referencedEvidenceIds(item, ids)
  }
  return ids
}

export function compactSynthesisInput(input: Row): Row {
  const modules = row(input.sourceModules)
  const rules = list(input.decisionRules)
  const historical = list(input.historicalReportContext)
  const graph = row(input.graph)
  const packet: Row = {
    factRegistry: list(input.factRegistry).map(item=>pick(item,['id','metric','subject','period','unit','value','scope','label','basis','availableAt','comparability'])),
    independentHypotheses: input.independentHypotheses, constraintSeparation: input.constraintSeparation,
    industry: input.industry, asOf: input.asOf, timeZone: input.timeZone,
    technicalReadiness: pick(input.technicalReadiness,['asOf','expectedSession','referenceSession','usable','requested','boundary']),
    decisionTiming: pick(input.decisionTiming, ['phase','asOf','expectedSession','closeDataSession','executionReady','reasons']),
    boundary: input.boundary, modules: input.modules, unknownEvidenceSummary: input.unknownEvidenceSummary,
    sourceModules: Object.fromEntries(Object.entries(modules).map(([key, value]) => [key, {
      ...pick(value, ['analysis','trend','riskLevel','sentiment','universeStatistics']),
      evidence: list(row(value).evidence).slice(0, 3).map(item => ({claim:text(row(item).claim,120),...pick(item,['source','date','evidenceIds','referenceIssues'])})),
      counterEvidence: list(row(value).counterEvidence).slice(0, 2),
      keyCompanies: list(row(value).keyCompanies).slice(0,4).map(item=>pick(item,['code','name','graphPath','matchedProducts','operatingEvidence','counterEvidence'])),
      catalysts: list(row(value).catalysts).slice(0,4).map(item=>pick(item,['opportunityKey','sourceEventIds','segmentIds','event','path','affectedCompanies','affectedEtfs','disclosedExposure','conditions','invalidation','pricingAssessment','confidence'])),
    }])),
    overview: pick(input.overview, ['analysis','stage','outlook']),
    decisionRules: rules.map(item=>({ ...pick(item,['ticker','state','unheldAction','heldAction']),factorDiagnostics:pick(row(item).factorDiagnostics,['return20Pct','return60Pct','relative20Pct','maxDrawdown120Pct','factorScore']),conditions:list(row(item).conditions).map(condition=>pick(condition,['label','status','value','operator','threshold'])) })),
    productComparison: input.productComparison,
    indexOverlaps: [...list(input.indexOverlaps)].sort((a,b)=>Number(row(b).weightedOverlapPct||0)-Number(row(a).weightedOverlapPct||0)).slice(0,8).map(item=>pick(item,['leftIndexCode','rightIndexCode','weightedOverlapPct','commonHoldings','periods','basis'])),
    graph: { etfExposure:list(graph.etfExposure).map(item=>({ ...pick(item,['code','name']),segments:list(row(item).segments).slice(0,3).map(segment=>pick(segment,['segment','segmentName','holdingVerified','matchedCompanies'])) })) },
    products: list(input.products).map(item=>pick(item,['ticker','indexCode','navDate','feePct','pe','pb','pePercentileHistory','pbPercentileHistory','valuationSampleCount','valuationDate','valuationSource','exposure','holdingsPeriod','top10WeightPct'])),
    historicalReportContext: historical.slice(0,3).map(item=>({sessionDate:row(item).sessionDate,role:'历史观点，仅作本轮验证',comprehensiveConclusion:pick(row(item).comprehensiveConclusion,['conclusion','opportunities','watchPoints'])})),
    reviewChanges: list(input.reviewChanges).slice(0,8),
    mappingLimit: input.mappingLimit,
    dataScope: {ruleProducts:rules.length,historyReports:historical.length,selectedHistoryReports:Math.min(3,historical.length),boundary:'综合层采用上游研判、来源和日期，不重复输入新闻全文、完整图谱；保留可追溯的完整证据编号；原始资料可在上游明细核对。'},
  }
  const compacted = removeNoise(packet) as Row
  const used = referencedEvidenceIds(compacted)
  for (const fact of list(compacted.factRegistry)) if (typeof row(fact).id === 'string') used.add(String(row(fact).id))
  const citationRegistry = list(input.citationRegistry).filter(item=>used.has(String(row(item).id)))
  return citationRegistry.length ? {...compacted,citationRegistry} : compacted
}

function removeNoise(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(removeNoise)
  if (!value || typeof value !== 'object') return typeof value === 'string' ? value.slice(0,500) : value
  return Object.fromEntries(Object.entries(value).filter(([key,item])=>item != null && !/^(?:reportId|snapshotId|contentHash|mappingContentHash)$/.test(key)).map(([key,item])=>[key,removeNoise(item)]))
}
