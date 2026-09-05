import type { ReplayLedgerEntry } from './replay'
import { replayResearch } from './replay'

const mean = (values: number[]) => values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null

export function summarizeValidation(entries: ReplayLedgerEntry[], costs = { commissionBps: 3, slippageBps: 5 }) {
  const ordered = [...entries].sort((a, b) => a.snapshot.asOf.localeCompare(b.snapshot.asOf))
  const sessions = new Set(ordered.map(item => item.evaluation.expectedSession || item.snapshot.asOf.slice(0, 10)))
  const first = ordered[0]?.snapshot.asOf
  const last = ordered.at(-1)?.snapshot.asOf
  const spanDays = first && last ? Math.floor((Date.parse(last) - Date.parse(first)) / 86400000) : 0
  const replay = replayResearch(ordered.map(item => item.snapshot), ordered.map(item => item.evaluation), costs)
  const results = replay.status === 'paper-only' ? replay.results.filter(item => typeof item.returnPct === 'number' && typeof item.benchmarkReturnPct === 'number') : []
  const totalTrades = results.reduce((sum, item) => sum + item.trades.length, 0)
  const excessReturns = results.map(item => item.returnPct! - item.benchmarkReturnPct!)
  const maxDrawdownPct = results.length ? Math.max(...results.map(item => item.maxDrawdownPct || 0)) : null
  const meanExcessReturnPct = mean(excessReturns)
  const hitRatePct = results.length ? results.filter(item => item.returnPct! > item.benchmarkReturnPct!).length / results.length * 100 : null
  const requirements = [
    { key: 'sessions', label: '独立交易日快照不少于480个', met: sessions.size >= 480, current: sessions.size, target: 480 },
    { key: 'span', label: '滚动区间不少于730天', met: spanDays >= 730, current: spanDays, target: 730 },
    { key: 'trades', label: '成本后模拟交易不少于30笔', met: totalTrades >= 30, current: totalTrades, target: 30 },
    { key: 'excess', label: '成本后平均超额收益为正', met: meanExcessReturnPct !== null && meanExcessReturnPct > 0, current: meanExcessReturnPct, target: 0 },
    { key: 'drawdown', label: '样本最大回撤不高于25%', met: maxDrawdownPct !== null && maxDrawdownPct <= 25, current: maxDrawdownPct, target: 25 },
  ]
  const tradeApproved = requirements.every(item => item.met)
  return {
    status: tradeApproved ? 'trade-ready' as const : 'watch-only' as const,
    tradeApproved,
    snapshotCount: ordered.length,
    sessionCount: sessions.size,
    spanDays,
    totalTrades,
    meanExcessReturnPct,
    hitRatePct,
    maxDrawdownPct,
    costs,
    requirements,
    replayStatus: replay.status,
  }
}
