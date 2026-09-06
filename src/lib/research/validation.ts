import type { ReplayLedgerEntry } from './replay'
import { replayResearch } from './replay'

const mean = (values: number[]) => values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null
const median = (values: number[]) => {
  if (!values.length) return null
  const ordered = [...values].sort((a, b) => a - b), middle = Math.floor(ordered.length / 2)
  return ordered.length % 2 ? ordered[middle] : (ordered[middle - 1] + ordered[middle]) / 2
}

export function summarizeValidation(entries: ReplayLedgerEntry[], costs = { commissionBps: 3, slippageBps: 5 }) {
  const ordered = [...entries].sort((a, b) => a.snapshot.asOf.localeCompare(b.snapshot.asOf))
  const calendarValid = ordered.filter(item=>item.evaluation.calendarVerified&&/^\d{4}-\d{2}-\d{2}$/.test(item.evaluation.expectedSession||''))
  // Repeated reviews on the same trading day are not independent observations.
  // Keep the latest frozen view for that session and expose the duplicate count.
  const bySession = new Map<string, ReplayLedgerEntry>()
  for (const item of calendarValid) bySession.set(item.evaluation.expectedSession!, item)
  const usable = [...bySession.values()].sort((a,b)=>a.evaluation.expectedSession!.localeCompare(b.evaluation.expectedSession!))
  const sessionList = usable.map(item => item.evaluation.expectedSession!)
  const sessions = new Set(sessionList)
  const first = sessionList[0]
  const last = sessionList.at(-1)
  const spanDays = first && last ? Math.floor((Date.parse(last) - Date.parse(first)) / 86400000) : 0
  const replay = replayResearch(usable.map(item => item.snapshot), usable.map(item => item.evaluation), costs)
  const results = replay.status === 'paper-only' ? replay.results.filter(item => typeof item.returnPct === 'number' && typeof item.benchmarkReturnPct === 'number') : []
  const totalTrades = results.reduce((sum, item) => sum + item.trades.length, 0)
  const excessReturns = results.map(item => item.returnPct! - item.benchmarkReturnPct!)
  const maxDrawdownPct = results.length ? Math.max(...results.map(item => item.maxDrawdownPct || 0)) : null
  const meanExcessReturnPct = mean(excessReturns)
  const medianExcessReturnPct = median(excessReturns)
  const worstExcessReturnPct = excessReturns.length ? Math.min(...excessReturns) : null
  const hitRatePct = results.length ? results.filter(item => item.returnPct! > item.benchmarkReturnPct!).length / results.length * 100 : null
  const stressedReplay = replayResearch(usable.map(item => item.snapshot), usable.map(item => item.evaluation), { commissionBps: costs.commissionBps * 2, slippageBps: costs.slippageBps * 2 })
  const stressedResults = stressedReplay.status === 'paper-only' ? stressedReplay.results.filter(item => typeof item.returnPct === 'number' && typeof item.benchmarkReturnPct === 'number') : []
  const costStressMeanExcessReturnPct = mean(stressedResults.map(item => item.returnPct! - item.benchmarkReturnPct!))
  const evaluationBySnapshot = new Map(usable.map(item=>[item.snapshot.id,item.evaluation]))
  const lookAheadViolations = results.flatMap(result=>result.trades.map(trade=>({result,trade}))).filter(({result,trade})=>{
    const entry=usable.find(item=>item.snapshot.id===trade.snapshotId),decision=evaluationBySnapshot.get(trade.snapshotId)?.decisions.find(item=>item.ticker===result.ticker)
    return !entry || Date.parse(`${trade.date}T09:30:00+08:00`)<=Date.parse(entry.snapshot.asOf) || (!!decision&&Date.parse(`${trade.date}T09:30:00+08:00`)>=Date.parse(decision.expiresAt))
  }).length
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
    usableSnapshotCount: usable.length,
    duplicateSnapshotCount: calendarValid.length - usable.length,
    sessionCount: sessions.size,
    spanDays,
    totalTrades,
    meanExcessReturnPct,
    medianExcessReturnPct,
    worstExcessReturnPct,
    costStressMeanExcessReturnPct,
    hitRatePct,
    maxDrawdownPct,
    eligibleResultCount: results.length,
    lookAheadViolations,
    costs,
    requirements,
    replayStatus: replay.status,
  }
}
