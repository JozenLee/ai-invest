import { cleanClaim } from './evidence-references'

/** Internal identifiers remain in the audit archive, never in reader-facing data. */
export function readableResearchData(value: unknown): unknown {
  if (typeof value === 'string') {
    const text=value.trim()
    if (/^[{[]/.test(text)) { try { return readableResearchData(JSON.parse(text)) } catch { /* preserve prose */ } }
    return value.replace('未绑定冻结证据编号，仅作待核验文字','该判断缺少可核验来源，需进一步复核').replace(/已移除不在本轮证据包的引用[\w-]*/g,'部分引用未通过本轮来源校验')
  }
  if (Array.isArray(value)) return value.map(readableResearchData)
  if (!value || typeof value !== 'object') return value
  return Object.fromEntries(Object.entries(value).filter(([key])=>!['evidenceId','evidenceIds','pricingEvidenceIds','factChecks','hypothesisId'].includes(key)).map(([key,item])=>[key,key==='claim'&&typeof item==='string'?cleanClaim(item):readableResearchData(item)]))
}
