import { prisma } from '@/lib/db'
import { revalidateAdvice } from './revalidate-advice'
import { chinaDate } from './time'
import type { Evaluation, ResearchSnapshot } from './contracts'
import type { StepContext } from '@/lib/workflow/types'

export const AUTO_REANALYSIS_POLICY = { maxDailyRuns: 2, cooldownMs: 6 * 3600_000 }
export type ReanalysisAudit = {
  status: 'not-needed' | 'started' | 'deferred' | 'completed' | 'failed'
  reasons: string[]
  assessedAt: string
  retryAfter?: string
  sourceReportId: string
  runId?: string
}

export async function latestAutoReanalysis(industryId: string): Promise<ReanalysisAudit | null> {
  const record = await prisma.rawPayload.findFirst({ where: { datasetKey: 'research_auto_reanalysis', targetCode: industryId }, orderBy: { fetchedAt: 'desc' } })
  if (!record) return null
  const audit = JSON.parse(record.payload) as ReanalysisAudit & { runId: string }
  const run = await prisma.executionRun.findUnique({ where: { id: audit.runId }, select: { status: true, error: true } })
  return { ...audit, status: run?.status === 'COMPLETED' ? 'completed' : run?.status === 'FAILED' || !run ? 'failed' : 'started',
    reasons: [...audit.reasons, ...(run?.error ? [run.error] : []), ...(!run ? ['关联执行记录缺失，请重新分析'] : [])] }
}

export function canReanalyze(quality: { status?: string; calendarVerified?: boolean; usable?: number; dataAnomalies?: unknown[]; modules?: { market?: { status?: string } } } | undefined) {
  if (!quality || quality.dataAnomalies?.length) return false
  return quality.status === 'available' || quality.status === 'limited' && quality.calendarVerified === true && (quality.usable || 0) > 0 && quality.modules?.market?.status === 'available'
}

export function reanalysisBudget(now: string, attempts: Array<{ startedAt: string; runId: string }>, runId: string) {
  const others = attempts.filter(row => row.runId !== runId)
  const today = others.filter(row => chinaDate(row.startedAt) === chinaDate(now))
  const latest = others.map(row => Date.parse(row.startedAt)).filter(Number.isFinite).sort((a,b) => b-a)[0]
  const cooldown = latest === undefined ? 0 : latest + AUTO_REANALYSIS_POLICY.cooldownMs
  const nextDay = Date.parse(`${chinaDate(now)}T00:00:00+08:00`) + 86400_000
  const retry = Math.max(cooldown, today.length >= AUTO_REANALYSIS_POLICY.maxDailyRuns ? nextDay : 0)
  return { allowed: retry <= Date.parse(now), retryAfter: retry > Date.parse(now) ? new Date(retry).toISOString() : undefined }
}

/** Run after the quantitative barrier, before any public AI wave. Reuse the
 * exact frozen evidence, and renew the thesis only through the complete DAG.
 * Explicit rules-only requests never opt into model calls. */
export async function escalateAutomaticReview(context: StepContext, evaluation: Evaluation, snapshot: ResearchSnapshot) {
  if (!context.input.rulesOnly || context.input.autoReanalysis !== true) return
  const parent = await prisma.aIAnalysisReport.findFirst({ where: { type: 'comprehensive', industryId: evaluation.profile.industryId, dataJson: { contains: `"runId":"${context.input.parentRunId}"` } }, orderBy: { createdAt: 'desc' } })
  const data = parent?.dataJson ? JSON.parse(parent.dataJson) : null
  if (!parent || !data?.investmentAdvice || !data.researchEvaluation) throw new Error('自动复核缺少原始报告与观点')
  const reviewed = revalidateAdvice({ advice: data.investmentAdvice, previous: data.researchEvaluation, current: evaluation, snapshot, sourceReportId: parent.id })
  const reasons = [...new Set(reviewed.productDecisions.flatMap(row => row.reviewProvenance.status === 'requires-new-analysis' ? row.reviewProvenance.reasons : []))]
  if (reviewed.reviewAudit.missingProducts.length) reasons.push('本轮新增研究产品，需要完整分析')
  const now = new Date().toISOString()
  let audit: ReanalysisAudit = { status: 'not-needed', reasons, assessedAt: now, sourceReportId: parent.id }
  if (reasons.length) {
    // No calls spent on an evidence package that cannot support new decisions.
    if (!canReanalyze(context.artifacts.get('data-quality'))) {
      audit = { ...audit, status: 'deferred', reasons: [...reasons, '核心行情、日历或数据异常未通过核验，先修复数据再重新分析'] }
    } else {
      audit = await prisma.$transaction(async tx => {
        const industryId = evaluation.profile.industryId
        const records = await tx.rawPayload.findMany({ where: { datasetKey: 'research_auto_reanalysis', targetCode: industryId }, orderBy: { fetchedAt: 'desc' }, take: 100 })
        const budget = reanalysisBudget(now, records.map(row => JSON.parse(row.payload)), context.runId)
        if (!budget.allowed) return { ...audit, status: 'deferred' as const, retryAfter: budget.retryAfter, reasons: [...reasons, '自动重分析处于冷却期或已达到每日调用上限'] }
        // A concurrent full analysis is already doing the needed work.
        const active = await tx.executionRun.findMany({ where: { workflowId: 'comprehensive-analysis', status: 'RUNNING', id: { not: context.runId }, OR: [{ startedAt: { gte: new Date(Date.parse(now)-6*3600_000) } }, { steps: { some: { OR: [{ startedAt: { gte: new Date(Date.parse(now)-15*60_000) } }, { completedAt: { gte: new Date(Date.parse(now)-15*60_000) } }] } } }] }, select: { metadata: true } })
        if (active.some(row => { const input = JSON.parse(row.metadata || '{}'); return input.industryId === industryId && !input.rulesOnly })) return { ...audit, status: 'deferred' as const, reasons: [...reasons, '该领域已有完整分析运行，等待其完成'] }
        const started = { ...audit, status: 'started' as const }
        const payload = JSON.stringify({ runId: context.runId, startedAt: now, ...started })
        await tx.rawPayload.upsert({ where: { id: `auto-reanalysis:${context.runId}` }, create: { id: `auto-reanalysis:${context.runId}`, datasetKey: 'research_auto_reanalysis', targetCode: industryId, provider: 'local-review', payload, contentHash: context.runId }, update: {} })
        const run = await tx.executionRun.findUniqueOrThrow({ where: { id: context.runId }, select: { metadata: true } })
        const metadata = { ...JSON.parse(run.metadata || '{}'), rulesOnly: false, publicOnly: true, autoReanalysisAudit: started }
        await tx.executionRun.update({ where: { id: context.runId }, data: { metadata: JSON.stringify(metadata) } })
        // Private AI remains skipped: automation does not inherit one-shot consent.
        await tx.executionStep.updateMany({ where: { runId: context.runId, status: 'SKIPPED', stepName: { in: ['market-analysis', 'news-analysis', 'company-analysis', 'industry-overview', 'social-report'] } }, data: { status: 'PENDING', completedAt: null, error: null } })
        return started
      }, { maxWait: 30_000, timeout: 30_000 })
    }
  }
  await context.saveArtifact('auto-reanalysis', audit, 'DATA')
  if (audit.status === 'started') await context.updateProgress(1, 1, '旧观点失效：已在同一冻结证据上升级完整AI分析')
}
