import { config } from 'dotenv'
config({ quiet: true })

async function main() {
  const industryId = process.argv[2]
  const rulesOnly = process.argv.includes('--rules-only')
  const parentRunId = process.argv.slice(3).find(value => !value.startsWith('--'))
  const resumeRunId=process.argv.find(value=>value.startsWith('--resume='))?.slice('--resume='.length)
  if (!industryId) throw new Error('请提供已订阅的领域ID')
  const { comprehensiveAnalysisWorkflow: workflow } = await import('../src/lib/workflow/workflows/comprehensive-analysis')
  const { reviewBaseline } = await import('../src/lib/workflow/run-lineage')
  const { prisma } = await import('../src/lib/db')
  try {
    const lineage = await reviewBaseline(industryId, parentRunId)
    const runId = resumeRunId || await workflow.createRun({ industryId, publicOnly: true, rulesOnly, ...lineage, kind: lineage.parentRunId ? 'review' : 'analysis', createdBy: 'workflow-acceptance', timestamp: new Date().toISOString() })
    console.log(JSON.stringify({ runId, phase: resumeRunId?'resumed':'started', publicOnly: true, rulesOnly }))
    if(resumeRunId)await workflow.resume(runId);else await workflow.executeAll(runId)
    const run = await workflow.getRunDetails(runId, true)
    if (!run || run.status !== 'COMPLETED' || run.steps.some(s => !['COMPLETED', 'SKIPPED'].includes(s.status))) throw new Error('存在未完成步骤')
    const artifacts = run.steps.flatMap(s => s.artifacts)
    const reportId = JSON.parse(artifacts.find(a => a.artifactKey === 'report-id')?.data || 'null')
    const evaluation = JSON.parse(artifacts.find(a => a.artifactKey === 'research-evaluation')?.data || 'null')
    if (!reportId || !evaluation?.snapshotId || evaluation.workflow?.runId !== runId) throw new Error('报告、决策或轮次关联不完整')
    const report = await prisma.aIAnalysisReport.findUnique({ where: { id: reportId } })
    if (!report || !report.content.includes('ETF')) throw new Error('报告没有保存完整研究内容')
    const metadata=JSON.parse(run.metadata||'{}')
    if (metadata.baselineSnapshotId && evaluation.previousSnapshotId !== metadata.baselineSnapshotId) throw new Error('复核未关联指定基准快照')
    console.log(JSON.stringify({ runId, reportId, phase: 'verified', steps: run.steps.length, snapshotId: evaluation.snapshotId, previousSnapshotId: evaluation.previousSnapshotId, etfs: evaluation.decisions.length, publicOnly: true, rulesOnly }))
  } finally { await prisma.$disconnect() }
}
void main().catch(error => { console.error(error instanceof Error ? error.message : '验收失败'); process.exitCode = 1 })
