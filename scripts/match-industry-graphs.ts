const appUrl = (process.env.APP_URL || 'http://localhost:3000').replace(/\/$/, '')

async function request(path: string, init?: RequestInit) {
  const response = await fetch(appUrl + path, { ...init, headers: { 'Content-Type': 'application/json', ...(init?.headers || {}) } })
  const text = await response.text()
  if (!response.ok) throw new Error(`${path} -> HTTP ${response.status}: ${text.slice(0, 500)}`)
  return JSON.parse(text)
}

async function main() {
  const industries = (await request('/api/graph/industries')).data as Array<{ id: string; name: string }>
  const results = []
  for (const industry of industries) {
    const swimlane = (await request(`/api/graph/industries/${encodeURIComponent(industry.id)}/swimlane`)).data
    const segments = (swimlane.stages || []).flatMap((stage: any) => stage.segments || []) as Array<{ id: string; name: string }>
    const details: any[] = new Array(segments.length)
    let cursor = 0
    const worker = async () => {
      while (cursor < segments.length) {
        const index = cursor++
        const segment = segments[index]
        try {
          const response = await request('/api/graph/match-etf-index', { method: 'POST', body: JSON.stringify({ scope: 'segment', targetId: segment.id, targetName: segment.name, options: { matchETF: true, matchIndex: true, topN: 5, minRelevance: 0.6, forceRefresh: false } }) })
          details[index] = response.data
        } catch (error) {
          details[index] = { nodeId: segment.id, nodeName: segment.name, success: false, error: error instanceof Error ? error.message : String(error) }
        }
      }
    }
    await Promise.all(Array.from({ length: Math.min(3, segments.length) }, () => worker()))
    const result = { industryId: industry.id, name: industry.name, matched: details.filter(item => item?.success).length, errors: details.filter(item => !item?.success).length, details }
    results.push(result)
    console.log(JSON.stringify({ event: 'industry_graph_matched', ...result }))
  }
  const projection = await request('/api/graph/projection/refresh', { method: 'POST', body: '{}' })
  console.log(JSON.stringify({ event: 'graph_projection_refreshed', projection: projection.data, results }))
  if (results.some(result => result.errors > 0 || result.matched === 0)) process.exitCode = 2
}

void main().catch(error => {
  console.error(error)
  process.exitCode = 1
})
