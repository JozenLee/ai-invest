import { config } from 'dotenv'
import assert from 'node:assert/strict'
config({ quiet: true })

/** Explicit live acceptance: refresh evidence, escalate stale theses, archive
 * one coherent decision, and replay validation. Never submits an order. */
async function main() {
  const industryId = process.argv.find(arg => arg.startsWith('--industry='))?.slice(11)
  if (!industryId) throw new Error('需要 --industry=领域编号')
  const { prisma } = await import('../src/lib/db')
  try {
    const { refreshUnifiedResearch } = await import('../src/lib/research/refresh')
    const { dailyExecution } = await import('../src/lib/research/lab/daily-store')
    const { verifyLatestExperiment } = await import('../src/lib/research/lab/store')
    const { verifyUnifiedValidation } = await import('../src/lib/research/strategy/validation-store')
    let result: Awaited<ReturnType<typeof refreshUnifiedResearch>>
    if (process.argv.includes('--archived')) {
      const {listUnifiedDecisionVersions}=await import('../src/lib/research/decision-ledger')
      const {runLab}=await import('../src/lib/research/lab/store')
      const decision=(await listUnifiedDecisionVersions(industryId)).find(row=>row.allocation)
      assert(decision,'没有可验证的归档统一决策')
      result={runId:decision.runId,snapshotId:decision.snapshotId,decisionVersionId:decision.id,experiment:await runLab(industryId,decision.snapshotId)}
    } else result = await refreshUnifiedResearch(industryId)
    const daily = await dailyExecution(industryId)
    assert.equal(daily.plan.decisionVersionId, result.decisionVersionId)
    assert.equal(daily.plan.sourceSnapshotId, result.snapshotId)
    assert.equal(result.experiment.snapshotId, result.snapshotId)
    const labReplay = await verifyLatestExperiment(industryId)
    const comparison = result.experiment.unifiedValidation
    assert(comparison, '综合决策未完成独立验证')
    const unifiedReplay = await verifyUnifiedValidation(industryId, comparison.id)
    const run = await prisma.executionRun.findUniqueOrThrow({ where: { id: result.runId }, include: { steps: true } })
    assert.equal(run.status, 'COMPLETED')
    assert(run.steps.every(step => ['COMPLETED','SKIPPED'].includes(step.status)))
    const metadata = JSON.parse(run.metadata || '{}')
    if (metadata.autoReanalysisAudit?.status === 'started') {
      for (const name of ['market-analysis','news-analysis','company-analysis','industry-overview','investment-advice']) assert.equal(run.steps.find(step => step.stepName === name)?.status, 'COMPLETED')
    }
    console.log(JSON.stringify({ mode:process.argv.includes('--archived')?'archived-replay':'live-refresh',workflow: 'passed', runId: result.runId, snapshotId: result.snapshotId, decisionVersionId: result.decisionVersionId,
      autoReanalysis: metadata.autoReanalysisAudit?.status || 'not-upgraded', labReplay, unifiedReplay,
      strategyEvidence: comparison.status, directionalMatured: result.experiment.decisionHistory?.directionalMatured || 0,
      executableActions: daily.plan.actions.filter(action => action.status === 'review').length, blockers: daily.plan.blockers,
      actualFills: daily.attribution.fills, note: '工程闭环验证与策略有效性分别评价；没有未来行情或真实成交时保持待验证。' }, null, 2))
  } finally { await prisma.$disconnect() }
}
void main().catch(error => { console.error(error instanceof Error ? error.message : String(error)); process.exitCode = 1 })
