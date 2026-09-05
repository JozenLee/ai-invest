import { config } from 'dotenv'
config({ quiet: true })
async function main() {
  const runId = process.argv[2]
  const { prisma } = await import('../src/lib/db/prisma')
  const { priceDiscontinuities } = await import('../src/lib/market-detail')
  const steps = await prisma.executionStep.findMany({ where: { runId }, include: { artifacts: true } })
  const qualityStep = steps.find(row => row.stepName === 'assess-data-quality')!
  const qualityArtifact = qualityStep.artifacts.find(row => row.artifactKey === 'data-quality')!
  const data = steps.flatMap(row => row.artifacts).find(row => row.artifactKey === 'etf-market-data')!
  const rows = JSON.parse(data.data!)
  const warnings = rows.flatMap((row: any) => {
    const discontinuities = priceDiscontinuities(row.history)
    return discontinuities.length ? [{ ticker: row.ticker, discontinuities }] : []
  })
  const quality = JSON.parse(qualityArtifact.data!)
  const review = { reviewedAt: new Date().toISOString(), affectedEtfs: warnings, instruction: '验收复核优先于此前AI文字：以下ETF原始历史存在单日超过30%的不连续变动，原因未经拆分/复权核验。禁止采用此前AI输出的跨断点均线、历史涨跌、波动率和最大回撤数字；它们不等于投资者真实损失。只能使用有效最新行情、单日涨跌、原始资金与独立企业/资讯证据。不得补造复权数据。' }
  await prisma.stepArtifact.upsert({ where: { stepId_artifactKey: { stepId: qualityStep.id, artifactKey: 'data-quality-before-review' } }, create: { stepId: qualityStep.id, artifactKey: 'data-quality-before-review', artifactType: 'DATA', dataType: 'json', data: qualityArtifact.data, size: qualityArtifact.size }, update: {} })
  const updated = JSON.stringify({ ...quality, status: warnings.length ? 'limited' : quality.status, continuityReview: review })
  await prisma.stepArtifact.update({ where: { id: qualityArtifact.id }, data: { data: updated, size: Buffer.byteLength(updated) } })
  console.log(JSON.stringify({ runId, affectedEtfs: warnings.length, reviewSaved: true }))
  await prisma.$disconnect()
}
void main()
