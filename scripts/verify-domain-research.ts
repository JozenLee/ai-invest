import { config } from 'dotenv'
import { createRequire } from 'node:module'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import type { StepContext } from '../src/lib/workflow/types'

config({ quiet: true })
const Database = createRequire(import.meta.url)('better-sqlite3')
async function main() {
  const { DOMAIN_PROMPT_VERSION, domainEvidence, domainPrompt, domainInputHash, compareDomainResearch, validateDomainOpinion } = await import('../src/lib/workflow/domain-research')
  const { domainResearchStep } = await import('../src/lib/workflow/steps/domain-research-step')
  const db = new Database((process.env.DATABASE_URL || 'file:./prisma/dev.db').replace(/^file:/, ''), { readonly: true })
  try {
    const revalidate = process.argv.find(arg => arg.startsWith('--revalidate='))?.slice(13)
    const archived = revalidate ? JSON.parse(await readFile(revalidate, 'utf8')) : null
    const requested = archived?.sourceReportId || process.argv.find(arg => arg.startsWith('--report='))?.slice(9)
    const report = (requested ? db.prepare('SELECT id,dataJson FROM AIAnalysisReport WHERE id=?').get(requested)
      : db.prepare("SELECT id,dataJson FROM AIAnalysisReport WHERE type='comprehensive' ORDER BY createdAt DESC LIMIT 1").get()) as { id: string; dataJson: string } | undefined
    if (!report) throw new Error('没有可验证的报告')
    const data = JSON.parse(report.dataJson), runId = data.metadata?.runId
    const rows = db.prepare('SELECT a.artifactKey,a.data FROM step_artifacts a JOIN execution_steps s ON s.id=a.stepId WHERE s.runId=? ORDER BY s.stepIndex,a.createdAt').all(runId) as Array<{ artifactKey: string; data: string }>
    const artifacts = new Map<string, unknown>()
    for (const row of rows) { try { artifacts.set(row.artifactKey, JSON.parse(row.data)) } catch { artifacts.set(row.artifactKey, row.data) } }
    const saved: Record<string, unknown> = archived?.artifacts || {}
    const directory = path.resolve('.runtime/domain-research')
    await mkdir(directory, { recursive: true })
    const output = revalidate ? path.resolve(revalidate) : path.join(directory, `domain-verification-${Date.now()}.json`)
    const context: StepContext = { runId: `domain-verification-${Date.now()}`, stepId: 'domain-research', artifacts, input: {},
      updateProgress: async (_current, _total, message) => { if (message) console.log(message) },
      saveArtifact: async (key, value) => {
        saved[key] = value; artifacts.set(key, value)
        if (key.startsWith('ai-error')) console.log(JSON.stringify({ key, error: value }))
        await writeFile(output, JSON.stringify({ sourceReportId: report.id, status:'running-or-failed', artifacts: saved }, null, 2), { mode:0o600 })
      },
    }
    const packet = domainEvidence(context)
    console.log(JSON.stringify({ sections: Object.fromEntries(Object.entries(packet).map(([key, value]) => [key, JSON.stringify(value).length])) }))
    const prompt = domainPrompt(packet)
    console.log(JSON.stringify({ sourceReportId: report.id, snapshotId: packet.snapshotId, inputCharacters: prompt.length, inputHash: domainInputHash(packet), events: packet.events.length, products: packet.market.products.length }))
    if (revalidate) {
      const input = saved['domain-research-input'] as { inputHash: string; promptVersion: string }
      if (input.inputHash !== domainInputHash(packet) || input.promptVersion !== DOMAIN_PROMPT_VERSION) throw new Error('输入或提示版本改变，不能复用原始模型输出')
      const response = saved['ai-response'] as { model: string; content: Array<{type:string;text?:string}> }
      const opinion = validateDomainOpinion(response.content.find(row=>row.type==='text')?.text || '', packet)
      const { validateFinancialFacts, financialFacts } = await import('../src/lib/analysis/financial-facts')
      const { validateDecisionFacts } = await import('../src/lib/analysis/decision-audit')
      validateFinancialFacts(opinion, financialFacts(artifacts.get('company-market-data')))
      validateDecisionFacts(opinion, context.artifacts.get('research-evaluation'))
      saved['domain-research'] = {version:1,status:'completed',snapshotId:packet.snapshotId,asOf:packet.asOf,generatedAt:new Date().toISOString(),inputHash:input.inputHash,promptVersion:DOMAIN_PROMPT_VERSION,model:response.model,opinion}
      saved['validation-recovery'] = {validatedAt:new Date().toISOString(),reason:'使用修正后的校验器复核已保存模型原文；原始失败记录保留，未重写模型结论。'}
    } else {
      if (!process.argv.includes('--live')) return
      await domainResearchStep.execute(context)
    }
    const result = { sourceReportId: report.id, verification: 'historical-snapshot-replay-not-forward-performance',
      domainResearch: saved['domain-research'], comparison: compareDomainResearch(saved['domain-research'] as never, data.investmentAdvice, packet.snapshotId), artifacts: saved }
    await writeFile(output, JSON.stringify(result, null, 2), { mode: 0o600 })
    console.log(JSON.stringify({ status: 'verified', output, opinion: (result.domainResearch as { opinion: unknown }).opinion }))
  } finally { db.close() }
}
void main().catch(error => { console.error(error instanceof Error ? error.message : error); process.exitCode = 1 })
