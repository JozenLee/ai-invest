import { prisma } from '@/lib/db'

export type NewsSegment = { industry_id: string; industry_code: string; industry_name: string; segment_code: string; segment_name: string }
let cached: { rows: NewsSegment[]; expires: number } | undefined
export async function getNewsTaxonomy(): Promise<NewsSegment[]> {
  if (cached && cached.expires > Date.now()) return cached.rows
  const base = process.env.DATA_SERVICE_URL || 'http://localhost:8000'
  try {
    const read = async (path: string) => {
      const response = await fetch(base + path, { signal: AbortSignal.timeout(10000), cache: 'no-store' })
      if (!response.ok) throw new Error('产业词典读取失败')
      return response.json()
    }
    const industries = await read('/api/v1/industries')
    const groups = await Promise.all(industries.map(async (industry: { id: string; code: string; name: string }) => {
      const graph = await read(`/api/v1/industries/${industry.id}/graph`)
      return (graph.stages || []).flatMap((stage: { segments?: Array<{ code: string; name: string }> }) =>
        (stage.segments || []).map(segment => ({ industry_id: industry.id, industry_code: industry.code, industry_name: industry.name, segment_code: segment.code, segment_name: segment.name })))
    }))
    const rows: NewsSegment[] = groups.flat()
    if (!rows.length) throw new Error('产业词典为空')
    await prisma.rawPayload.upsert({ where: { id: 'news-taxonomy' }, create: { id: 'news-taxonomy', datasetKey: 'news_taxonomy', targetCode: 'all', provider: 'graph', payload: JSON.stringify(rows), contentHash: 'taxonomy' }, update: { payload: JSON.stringify(rows), fetchedAt: new Date() } })
    cached = { rows, expires: Date.now() + 300000 }
    return rows
  } catch (error) {
    const snapshot = await prisma.rawPayload.findUnique({ where: { id: 'news-taxonomy' } })
    if (snapshot) return JSON.parse(snapshot.payload)
    if (cached) return cached.rows
    throw error
  }
}

export function matchesNewsIndustry(serialized: string | null, codes: Set<string>) {
  try {
    const values: unknown = JSON.parse(serialized || '[]')
    return Array.isArray(values) && values.some(code => typeof code === 'string' && codes.has(code))
  } catch { return false }
}
