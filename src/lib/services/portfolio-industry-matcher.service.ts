import { aiClient } from '@/lib/ai/ai-factory'

const DATA_SERVICE_URL = process.env.DATA_SERVICE_URL || 'http://localhost:8000'

export type GraphIndustryCandidate = {
  code: string
  name: string
  description?: string
}

export type IndustryMatch = {
  industryDomain: string
  industryDomainCode?: string
  confidence?: number
  source: 'ai'
}

type HoldingInput = {
  ticker: string
  name: string
  category?: string | null
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : []
}

function text(value: unknown) {
  return typeof value === 'string' ? value.trim() : ''
}

function number(value: unknown) {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? Math.max(0, Math.min(1, parsed)) : undefined
}

function parseJson(value: string): Record<string, unknown> | null {
  const cleaned = value.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '')
  try {
    const parsed = JSON.parse(cleaned)
    return asRecord(parsed)
  } catch {
    const start = cleaned.indexOf('{')
    const end = cleaned.lastIndexOf('}')
    if (start < 0 || end <= start) return null
    try { return asRecord(JSON.parse(cleaned.slice(start, end + 1))) } catch { return null }
  }
}

function normalizeCandidates(payload: unknown): GraphIndustryCandidate[] {
  const root = asRecord(payload)
  const rows = asArray(root.data ?? root.industries ?? root.items ?? payload)
  return rows.map((item) => {
    const row = asRecord(item)
    return {
      code: text(row.code ?? row.id ?? row.industryCode ?? row.industry_code),
      name: text(row.name ?? row.industryName ?? row.industry_name ?? row.title),
      description: text(row.description ?? row.summary),
    }
  }).filter((item) => item.code && item.name)
}

export async function fetchGraphIndustryCandidates(): Promise<GraphIndustryCandidate[]> {
  try {
    const response = await fetch(`${DATA_SERVICE_URL}/api/v1/industries`, {
      signal: AbortSignal.timeout(15000),
      cache: 'no-store',
    })
    if (!response.ok) return []
    return normalizeCandidates(await response.json())
  } catch (error) {
    console.warn('获取知识图谱产业领域失败:', error)
    return []
  }
}

function candidateByResult(result: Record<string, unknown>, candidates: GraphIndustryCandidate[]) {
  const resultCode = text(result.industryDomainCode ?? result.industry_domain_code ?? result.code)
  const resultName = text(result.industryDomain ?? result.industry_domain ?? result.industryName ?? result.industry_name ?? result.name)
  return candidates.find((item) => (resultCode && item.code === resultCode) || (resultName && item.name === resultName))
}

export async function matchHoldingsToGraphIndustries(holdings: HoldingInput[]): Promise<Record<string, IndustryMatch>> {
  if (!holdings.length) return {}
  const candidates = await fetchGraphIndustryCandidates()
  if (!candidates.length) return {}

  try {
    const response = await aiClient.complete({
      prompt: `请将每只基金匹配到最合适的知识图谱产业领域。只能从候选领域中选择，无法可靠匹配时返回 null。\n\n基金：${JSON.stringify(holdings)}\n候选领域：${JSON.stringify(candidates.slice(0, 300))}\n\n只返回 JSON：\n{"matches":[{"ticker":"基金代码","industryDomainCode":"候选代码或null","industryDomain":"候选名称或null","confidence":0.0,"reason":"简短理由"}]}`,
      maxTokens: Math.min(3000, Math.max(900, holdings.length * 180)),
      system: '你是知识图谱标注助手。只能使用候选领域，不得创造领域名称。优先依据基金名称、基金类别和代码判断，输出纯 JSON。',
    })
    const parsed = parseJson(response)
    const rows = asArray(parsed?.matches)
    const matches: Record<string, IndustryMatch> = {}
    for (const item of rows) {
      const row = asRecord(item)
      const ticker = text(row.ticker ?? row.code)
      const candidate = candidateByResult(row, candidates)
      if (!ticker || !candidate) continue
      matches[ticker] = {
        industryDomain: candidate.name,
        industryDomainCode: candidate.code,
        confidence: number(row.confidence),
        source: 'ai',
      }
    }
    return matches
  } catch (error) {
    console.warn('AI匹配持仓产业领域失败:', error)
    return {}
  }
}

export async function matchHoldingToGraphIndustry(holding: HoldingInput): Promise<IndustryMatch | null> {
  const matches = await matchHoldingsToGraphIndustries([holding])
  return matches[holding.ticker] || null
}
