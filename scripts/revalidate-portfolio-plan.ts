/** Revalidate a saved model plan after a validator fix; preserve all original audit receipts. */
import 'dotenv/config'
import { createHash } from 'node:crypto'
import { mkdir, open, unlink } from 'node:fs/promises'
import { prisma } from '../src/lib/db/prisma'
import { withDatabaseBusyRetry } from '../src/lib/db/retry'
import { comprehensiveAnalysisWorkflow } from '../src/lib/workflow/workflows/comprehensive-analysis'
import { saveValidatedResearchOutput } from '../src/lib/workflow/research-output'
import type { StepContext } from '../src/lib/workflow/types'

async function main() {
  const runId = process.argv[2]
  if (!/^[\w-]{1,150}$/.test(runId || '')) throw new Error('无效轮次编号')
  await mkdir('.runtime/analysis', { recursive: true })
  const lockPath = `.runtime/analysis/${runId}.lock`
  const lock = await open(lockPath, 'wx')
  await lock.writeFile(String(process.pid)); await lock.close()
  try {
    const run = await prisma.executionRun.findUniqueOrThrow({ where: { id: runId }, include: { steps: { include: { artifacts: true }, orderBy: { stepIndex: 'asc' } } } })
    if (run.workflowId !== 'comprehensive-analysis' || run.steps.some(step => step.status === 'RUNNING')) throw new Error('轮次无效或仍在执行')
    const affected = run.steps.filter(step => ['portfolio-decision','social-report','generate-report'].includes(step.stepName))
    const report = await prisma.aIAnalysisReport.findFirst({ where: { dataJson: { contains: JSON.stringify({ runId }).slice(1, -1) } }, orderBy: { createdAt: 'desc' } })
    const payload = JSON.stringify({ capturedAt: new Date().toISOString(), reason: '校验逻辑修复后，重新核验既有私有方案，原始响应及报告版本保留', report, steps: run.steps })
    const hash = createHash('sha256').update(payload).digest('hex')
    await withDatabaseBusyRetry(() => prisma.rawPayload.upsert({ where: { id: `portfolio-revalidation:${hash}` }, create: { id: `portfolio-revalidation:${hash}`, datasetKey: 'portfolio_revalidation_archive', targetCode: runId, provider: 'local-audit', payload, contentHash: hash }, update: {} }))
    const artifacts = new Map(run.steps.flatMap(step => step.artifacts.map(artifact => [artifact.artifactKey, JSON.parse(artifact.data || 'null')] as [string, unknown])))
    // Recompute validation from the same saved outputs; this never re-runs a public model or recaptures evidence.
    for (const key of ['market-analysis','news-analysis','company-analysis','industry-overview','investment-advice']) {
      const step = run.steps.find(item => item.stepName === key)
      const raw = artifacts.get(key)
      if (!step || raw == null) continue
      const ctx: StepContext = { runId, stepId: step.id, input: JSON.parse(run.metadata || '{}'), artifacts, updateProgress: async () => undefined, saveArtifact: async (artifactKey, value) => {
        const data = JSON.stringify(value)
        await withDatabaseBusyRetry(() => prisma.stepArtifact.upsert({ where: { stepId_artifactKey: { stepId: step.id, artifactKey } }, create: { stepId: step.id, artifactKey, artifactType: 'DATA', dataType: 'JSON', data, size: Buffer.byteLength(data) }, update: { data, size: Buffer.byteLength(data) } }))
        artifacts.set(artifactKey, value)
      } }
      await saveValidatedResearchOutput(ctx, key, typeof raw === 'string' ? raw : JSON.stringify(raw))
    }
    // Preserve namespaced requests, responses and errors so recovery can verify identical input.
    await prisma.executionStep.updateMany({ where: { id: { in: affected.map(step => step.id) } }, data: { status: 'PENDING', startedAt: null, completedAt: null, error: null, progress: null } })
    await prisma.executionRun.update({ where: { id: runId }, data: { status: 'PENDING', completedAt: null, error: null } })
    await comprehensiveAnalysisWorkflow.resume(runId)
    const revised = await prisma.aIAnalysisReport.findFirstOrThrow({ where: { dataJson: { contains: JSON.stringify({ runId }).slice(1, -1) } }, orderBy: { createdAt: 'desc' } })
    const data = JSON.parse(revised.dataJson || '{}')
    const originalData = report?.dataJson ? JSON.parse(report.dataJson) : null
    if (data.analysisStatuses?.portfolio?.status === 'fallback' && originalData?.analysisStatuses?.portfolio?.status === 'completed' && report) {
      const failedPayload = JSON.stringify({ capturedAt: new Date().toISOString(), reason: '复核输出未通过校验，保留此前已通过报告', report: revised })
      await withDatabaseBusyRetry(() => prisma.$transaction(async tx => {
        await tx.rawPayload.create({ data: { datasetKey: 'portfolio_revalidation_failed_output', targetCode: runId, provider: 'local-audit', payload: failedPayload, contentHash: createHash('sha256').update(failedPayload).digest('hex') } })
        await tx.aIAnalysisReport.update({ where: { id: report.id }, data: { type: report.type, industryId: report.industryId, industryName: report.industryName, title: report.title, summary: report.summary, content: report.content, dataJson: report.dataJson } })
        for (const savedStep of affected) {
          await tx.stepArtifact.deleteMany({ where: { stepId: savedStep.id } })
          if (savedStep.artifacts.length) await tx.stepArtifact.createMany({ data: savedStep.artifacts.map(artifact => ({ id: artifact.id, stepId: artifact.stepId, artifactKey: artifact.artifactKey, artifactType: artifact.artifactType, dataType: artifact.dataType, data: artifact.data, fileUrl: artifact.fileUrl, size: artifact.size, createdAt: artifact.createdAt })) })
          await tx.executionStep.update({ where: { id: savedStep.id }, data: { status: savedStep.status, startedAt: savedStep.startedAt, completedAt: savedStep.completedAt, duration: savedStep.duration, error: savedStep.error, progress: savedStep.progress } })
        }
        await tx.executionRun.update({ where: { id: runId }, data: { status: run.status, completedAt: run.completedAt, error: run.error } })
      }))
      console.log(JSON.stringify({ reportId: report.id, factAudit: originalData.factAudit?.status, portfolio: originalData.analysisStatuses?.portfolio, selected: originalData.portfolioDecisionSupport?.alternatives?.selectedId, hypotheses: originalData.investmentTheses?.length, revalidation: 'rejected-and-restored' }))
      return
    }
    console.log(JSON.stringify({ reportId: revised.id, factAudit: data.factAudit?.status, portfolio: data.analysisStatuses?.portfolio, selected: data.portfolioDecisionSupport?.alternatives?.selectedId, hypotheses: data.investmentTheses?.length }))
  } finally { await unlink(lockPath).catch(() => undefined) }
}
main().catch(error => { console.error(error instanceof Error ? error.message : 'Revalidation failed'); process.exitCode = 1 }).finally(() => prisma.$disconnect())
