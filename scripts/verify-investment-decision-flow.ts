/** Read-only archived audit by default; --live creates a new report without modifying history. */
import 'dotenv/config'
import { prisma } from '../src/lib/db/prisma'
import { auditReportFacts } from '../src/lib/analysis/fact-audit'
import type { ResearchSnapshot } from '../src/lib/research/contracts'

async function main() {
  const latest = await prisma.aIAnalysisReport.findFirstOrThrow({ where: { type: 'comprehensive' }, orderBy: { createdAt: 'desc' } })
  const stored = JSON.parse(latest.dataJson || '{}')
  if (process.argv.includes('--live')) {
    const previous = await prisma.executionRun.findUniqueOrThrow({ where: { id: stored.metadata.runId } })
    const metadata = JSON.parse(previous.metadata || '{}')
    const destination = new URL(process.env.ANTHROPIC_BASE_URL || 'https://api.anthropic.com').origin
    // Prior consent is reusable only for exactly the same destination.
    const consent = metadata.portfolioAiConsent === destination ? destination : undefined
    const { comprehensiveAnalysisWorkflow: workflow } = await import('../src/lib/workflow/workflows/comprehensive-analysis')
    const runId = await workflow.createRun({ industryId: latest.industryId, rulesOnly: false, publicOnly: false, portfolioAiConsent: consent, verificationMode: null, optimizationVersion: 3, createdBy: 'user', timestamp: new Date().toISOString() })
    console.log(JSON.stringify({ runId, previousReportId: latest.id }))
    await workflow.executeAll(runId)
    const report = await prisma.aIAnalysisReport.findFirstOrThrow({ where: { type: 'comprehensive', dataJson: { contains: JSON.stringify({ runId }).slice(1, -1) } } })
    const data = JSON.parse(report.dataJson || '{}')
    console.log(JSON.stringify({ reportId: report.id, runId, factAudit: data.factAudit, hypotheses: data.investmentTheses?.length, portfolioVersion: data.portfolioDecisionSupport?.allocationVersion, selected: data.portfolioDecisionSupport?.alternatives?.selectedId, modelStatuses: data.analysisStatuses }))
    return
  }
  const snapshotRow = await prisma.rawPayload.findUnique({ where: { id: stored.researchEvaluation?.snapshotId } })
  const snapshot = snapshotRow ? JSON.parse(snapshotRow.payload) as ResearchSnapshot : undefined
  const audit = auditReportFacts({ market: stored.marketAnalysis, company: stored.companyAnalysis, news: stored.sentimentAnalysis, investment: stored.investmentAdvice }, { evaluation: stored.researchEvaluation, snapshot, companyData: snapshot?.projections?.['fetch-company-data']?.['company-market-data'], facts: stored.researchFacts })
  console.log(JSON.stringify({ reportId: latest.id, audit }, null, 2))
}
main().catch(error => { console.error(error instanceof Error ? error.message : 'Verification failed'); process.exitCode = 1 }).finally(() => prisma.$disconnect())
