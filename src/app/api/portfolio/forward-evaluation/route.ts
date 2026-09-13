import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/lib/db/prisma'
import { sameOriginRequest } from '@/lib/security/request-origin'
import { evaluatePortfolioForwardCohorts, latestPortfolioForwardEvaluation, listPortfolioForwardCohorts, type ForwardSelector } from '@/lib/portfolio/forward-cohort-store'

export const runtime = 'nodejs'
export const maxDuration = 300
const headers = { 'Cache-Control': 'private, no-store' }
const response = (body: unknown, status = 200) => NextResponse.json(body, { status, headers })
const object = (v: unknown): Record<string, unknown> => v && typeof v === 'object' && !Array.isArray(v) ? v as Record<string, unknown> : {}
function selectorOf(value: Record<string, unknown>): ForwardSelector {
  const selector: ForwardSelector = {}
  for (const key of ['reportId', 'runId', 'cohortId'] as const) {
    const id = value[key]
    if (id === undefined) continue
    if (typeof id !== 'string' || !id.trim() || id.length > 200 || !/^[\w:.-]+$/.test(id)) throw new Error(`无效${key}`)
    selector[key] = id
  }
  return selector
}

/** A current report selector always bounds this private endpoint. No selector
 * means the latest comprehensive report, not all cohorts or all accounts. */
async function resolveCurrentReport(selector: ForwardSelector) {
  if (selector.runId || selector.cohortId) return { selector, reportId: selector.reportId || null }
  if (selector.reportId) {
    const linked = await listPortfolioForwardCohorts(selector)
    if (linked.length) return { selector, reportId: selector.reportId }
  }
  const report = selector.reportId
    ? await prisma.aIAnalysisReport.findUnique({ where: { id: selector.reportId }, select: { id: true, dataJson: true } })
    : await prisma.aIAnalysisReport.findFirst({ where: { type: 'comprehensive' }, orderBy: { createdAt: 'desc' }, select: { id: true, dataJson: true } })
  if (!report) return null
  let data: Record<string, unknown> = {}
  try { data = object(JSON.parse(report.dataJson || '{}')) } catch { /* Missing lineage stays unverified. */ }
  const runId = object(data.metadata).runId
  return { selector: typeof runId === 'string' && runId ? { runId } : { reportId: report.id }, reportId: report.id }
}

export async function GET(request: NextRequest) {
  let requested: ForwardSelector
  try { requested = selectorOf(Object.fromEntries(request.nextUrl.searchParams)) } catch (error) { return response({ error: (error as Error).message }, 400) }
  try {
    const current = await resolveCurrentReport(requested)
    if (!current) return response({ status: 'unverified', cohorts: [], reason: '尚无可定位的综合报告' }, 404)
    const cohorts = await listPortfolioForwardCohorts(current.selector)
    const records = await Promise.all(cohorts.map(async cohort => ({ cohort, latest: await latestPortfolioForwardEvaluation(cohort.id) })))
    return response({ scope: 'current-report', reportId: current.reportId, selector: current.selector,
      status: records.length ? 'captured' : 'unverified', records,
      reason: records.length ? null : '该报告尚未捕获前向cohort；不会根据事后行情补造历史方案。', validation: 'not-validated' })
  } catch { return response({ error: '前向归档读取失败或完整性校验失败' }, 500) }
}

/** Periodic caller posts the same reportId/runId after public NAV collection.
 * Only evaluation receipts are appended; no report, account or orders are changed. */
export async function POST(request: NextRequest) {
  if (!sameOriginRequest(request)) return response({ error: '禁止跨站发起私有前向评估' }, 403)
  let body: Record<string, unknown>, requested: ForwardSelector
  try {
    const raw = await request.text(), decoded = raw ? JSON.parse(raw) : {}
    if (!decoded || typeof decoded !== 'object' || Array.isArray(decoded)) throw new Error('请求必须为JSON对象')
    body = decoded; requested = selectorOf(body)
    if (body.limit !== undefined && (!Number.isInteger(body.limit) || Number(body.limit) < 1 || Number(body.limit) > 100)) throw new Error('limit必须为1–100')
    if (body.asOf !== undefined && (typeof body.asOf !== 'string' || !/T.*(?:Z|[+-]\d{2}:\d{2})$/.test(body.asOf) || !Number.isFinite(Date.parse(body.asOf)) || Date.parse(body.asOf) > Date.now())) throw new Error('asOf必须是当前时刻之前的带时区时间')
  } catch (error) { return response({ error: (error as Error).message }, 400) }
  try {
    const current = await resolveCurrentReport(requested)
    if (!current) return response({ status: 'unverified', reason: '尚无可定位的综合报告' }, 404)
    const result = await evaluatePortfolioForwardCohorts({ ...current.selector, asOf: body.asOf as string | undefined, limit: body.limit as number | undefined })
    return response({ scope: 'current-report', reportId: current.reportId, selector: current.selector, ...result, validation: 'not-validated',
      reason: result.checked ? null : '该报告尚未捕获前向cohort；未创建任何历史交易或补造方案。' })
  } catch { return response({ error: '前向评估追加失败；冻结方案保持原样' }, 500) }
}
