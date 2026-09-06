import { createHash, randomUUID } from 'node:crypto'
import { prisma } from '@/lib/db'

const appUrl = (process.env.APP_URL || 'http://localhost:3000').replace(/\/$/, '')
const origin = new URL(appUrl).origin
const pause = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))

type Industry = { id: string; name: string; version: number; revisionId: string | null }

async function json<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(appUrl + path, { ...init, headers: { Origin: origin, 'Content-Type': 'application/json', ...(init?.headers || {}) } })
  const text = await response.text()
  if (!response.ok) throw new Error(`${path} -> HTTP ${response.status}: ${text.slice(0, 500)}`)
  return JSON.parse(text) as T
}

function artifact(step: any, key: string) {
  return step?.artifacts?.find((item: any) => item.artifactKey === key)?.data
}

async function waitForRun(runId: string) {
  const deadline = Date.now() + 20 * 60_000
  while (Date.now() < deadline) {
    const run = await json<any>(`/api/analysis/comprehensive/${runId}`)
    if (run.status === 'COMPLETED') return run
    if (run.status === 'FAILED') throw new Error(run.error || `analysis ${runId} failed`)
    await pause(5000)
  }
  throw new Error(`analysis ${runId} timed out`)
}

function verifyRun(industry: Industry, run: any, report: any) {
  const issues: string[] = []
  const revisionId = industry.revisionId
  const reportData = JSON.parse(report.dataJson || '{}')
  if (!revisionId || industry.version < 1) issues.push('产业没有已发布图谱版本')
  if (reportData.graphContext?.revisionId !== revisionId) issues.push('报告未冻结当前图谱版本')
  if (reportData.researchManifest?.graphRevision?.revisionId !== revisionId) issues.push('研究清单缺少图谱版本')
  if (reportData.metadata?.graphRevisionId !== revisionId) issues.push('报告元数据缺少图谱版本')
  if (!reportData.graphContext?.coverage?.segments) issues.push('报告图谱上下文没有产业环节')
  if (!reportData.graphContext?.coverage?.relations) issues.push('报告图谱上下文没有传导关系')
  if (!String(report.content || '').includes('产业认知基线与传导')) issues.push('报告正文缺少产业认知章节')
  if (reportData.metadata?.verificationMode !== 'graph-e2e') issues.push('报告未标记为图谱链路验证')
  if (!String(report.title || '').includes('图谱链路验证')) issues.push('验证报告标题缺少用途标识')
  for (const stepName of ['company-analysis', 'news-analysis', 'industry-overview', 'investment-advice']) {
    const step = run.steps.find((item: any) => item.stepName === stepName)
    const prompt = JSON.stringify(artifact(step, 'ai-prompt') || '')
    if (!revisionId || !prompt.includes(revisionId)) issues.push(`${stepName}提示词未包含图谱版本`)
  }
  return {
    passed: issues.length === 0,
    issues,
    runId: run.id,
    reportId: report.id,
    industryId: industry.id,
    industryName: industry.name,
    graphRevisionId: revisionId,
    graphVersion: industry.version,
    graphCoverage: reportData.graphContext?.coverage || null,
  }
}

async function main() {
  let payload: { success: boolean; data: Industry[] }
  try {
    payload = await json<{ success: boolean; data: Industry[] }>('/api/graph/industries')
  } catch {
    const snapshot = await prisma.rawPayload.findFirst({ where: { datasetKey: 'industry_graph' }, orderBy: { fetchedAt: 'desc' } })
    if (!snapshot) throw new Error('图谱 API 与本地投影均不可用')
    payload = { success: true, data: JSON.parse(snapshot.payload).map((industry: any) => ({ id: industry.id, name: industry.name, version: Number(industry.version || 0), revisionId: industry.revisionId || industry.revision_id || null })) }
  }
  const requestedIds = process.argv.flatMap((arg, index, args) => arg === '--industry-id' && args[index + 1] ? [args[index + 1]] : [])
  const industries = requestedIds.length ? payload.data.filter(industry => requestedIds.includes(industry.id)) : payload.data
  const results: any[] = []
  for (const industry of industries) {
    try {
      const created = await json<{ runId: string }>('/api/analysis/comprehensive', { method: 'POST', body: JSON.stringify({ industryId: industry.id, companySource: 'graph', publicOnly: true, verificationMode: 'graph-e2e' }) })
      await json(`/api/analysis/comprehensive/${created.runId}/execute?mode=all`, { method: 'POST', body: '{}' })
      const run = await waitForRun(created.runId)
      const reportId = run.steps.flatMap((step: any) => step.artifacts || []).find((item: any) => item.artifactKey === 'report-id')?.data
      if (!reportId) throw new Error('分析完成但没有report-id')
      const report = await json<any>(`/api/analysis/reports/${encodeURIComponent(String(reportId))}`)
      const result = verifyRun(industry, run, report)
      results.push(result)
      console.log(JSON.stringify({ event: 'industry_report_verified', ...result }, null, 2))
    } catch (error) {
      const result = { passed: false, industryId: industry.id, industryName: industry.name, issues: [error instanceof Error ? error.message : String(error)] }
      results.push(result)
      console.error(JSON.stringify({ event: 'industry_report_failed', ...result }, null, 2))
    }
  }
  const audit = { version: 1, completedAt: new Date().toISOString(), results }
  const serialized = JSON.stringify(audit)
  await prisma.rawPayload.create({ data: { id: randomUUID(), datasetKey: 'graph_report_e2e', targetCode: 'all', provider: 'comprehensive-analysis-e2e', payload: serialized, contentHash: createHash('sha256').update(serialized).digest('hex') } })
  await prisma.$disconnect()
  if (!results.length || results.some(result => !result.passed)) process.exitCode = 2
}

void main().catch(async error => {
  console.error(error)
  await prisma.$disconnect()
  process.exitCode = 1
})
