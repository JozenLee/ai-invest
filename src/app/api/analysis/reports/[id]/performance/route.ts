import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import type { Evaluation, ResearchSnapshot } from '@/lib/research/contracts'
import type { ReplayLedgerEntry } from '@/lib/research/replay'
import { summarizeValidation } from '@/lib/research/validation'

function parse<T>(value: string): T | null { try { return JSON.parse(value) as T } catch { return null } }

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const report = await prisma.aIAnalysisReport.findUnique({ where: { id }, select: { type: true, industryId: true } })
    if (!report || report.type !== 'comprehensive') return NextResponse.json({ error: 'Report not found' }, { status: 404 })
    const rows = await prisma.rawPayload.findMany({
      where: { datasetKey: 'research_validation_ledger', targetCode: report.industryId },
      orderBy: { fetchedAt: 'asc' }, take: 600, select: { payload: true },
    })
    const entries = rows.flatMap(row => {
      const value = parse<{ snapshot?: ResearchSnapshot; evaluation?: Evaluation }>(row.payload)
      return value?.snapshot && value.evaluation ? [{ snapshot: value.snapshot, evaluation: value.evaluation } satisfies ReplayLedgerEntry] : []
    })
    if (entries.length) return NextResponse.json(summarizeValidation(entries))

    // Legacy reports predate the compact replay ledger. Count them, but never infer performance.
    const legacy = await prisma.rawPayload.findMany({
      where: { datasetKey: 'research_evaluation', targetCode: report.industryId },
      orderBy: { fetchedAt: 'asc' }, take: 600, select: { payload: true },
    })
    const evaluations = legacy.flatMap(row => { const value = parse<Evaluation>(row.payload); return value ? [value] : [] })
    const sessions = new Set(evaluations.map(item => item.expectedSession || item.asOf.slice(0, 10)))
    return NextResponse.json({
      status: 'watch-only', tradeApproved: false, snapshotCount: evaluations.length, sessionCount: sessions.size,
      spanDays: evaluations.length > 1 ? Math.floor((Date.parse(evaluations.at(-1)!.asOf) - Date.parse(evaluations[0].asOf)) / 86400000) : 0,
      totalTrades: 0, meanExcessReturnPct: null, hitRatePct: null, maxDrawdownPct: null, costs: { commissionBps: 3, slippageBps: 5 }, replayStatus: 'legacy-insufficient',
      requirements: [
        { key: 'sessions', label: '独立交易日快照不少于480个', met: false, current: sessions.size, target: 480 },
        { key: 'span', label: '滚动区间不少于730天', met: false, current: 0, target: 730 },
        { key: 'trades', label: '成本后模拟交易不少于30笔', met: false, current: 0, target: 30 },
        { key: 'excess', label: '成本后平均超额收益为正', met: false, current: null, target: 0 },
        { key: 'drawdown', label: '样本最大回撤不高于25%', met: false, current: null, target: 25 },
      ],
    })
  } catch (error) {
    console.error('Failed to calculate report performance:', error)
    return NextResponse.json({ error: '绩效验证读取失败' }, { status: 500 })
  }
}
