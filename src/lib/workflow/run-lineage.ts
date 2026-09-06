import { prisma } from '@/lib/db'

/** A review belongs to one completed analysis and compares its exact snapshot. */
export async function reviewBaseline(industryId: string, parentRunId?: unknown) {
  if (parentRunId == null) return { parentRunId: null, baselineSnapshotId: null }
  if (typeof parentRunId !== 'string' || !/^[\w-]{1,100}$/.test(parentRunId)) throw new Error('复核来源轮次无效')
  const parent = await prisma.executionRun.findUnique({
    where: { id: parentRunId },
    include: { steps: { include: { artifacts: { where: { artifactKey: 'research-evaluation' }, select: { data: true } } } } },
  })
  if (!parent || parent.workflowId !== 'comprehensive-analysis' || parent.status !== 'COMPLETED') throw new Error('只能复核已完成的综合分析')
  const metadata = JSON.parse(parent.metadata || '{}')
  if (metadata.industryId !== industryId) throw new Error('复核来源与当前领域不一致')
  const data = parent.steps.flatMap(s => s.artifacts)[0]?.data
  const baseline = data ? JSON.parse(data) : null
  if (!baseline?.snapshotId) throw new Error('旧版报告没有冻结快照，请先新建综合分析')
  return { parentRunId, baselineSnapshotId: String(baseline.snapshotId) }
}
