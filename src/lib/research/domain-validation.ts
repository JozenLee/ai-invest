import { adjustedBars, validBars } from './engine'
import { chinaDate } from './time'
import type { ResearchSnapshot } from './contracts'
import type { DomainResearch } from '@/lib/workflow/domain-research'

/** Forward observation of a declared proxy, never a simulated account return. */
export function validateDomainHistory(history: DomainResearch[], snapshot: ResearchSnapshot) {
  const samples: Array<{ inputHash: string; ticker: string; start: string; end: string; stance: string; proxyReturnPct: number; excessReturnPct: number }> = []
  let pending = 0, excluded = 0
  const seen = new Set<string>()
  const benchmark = validBars(snapshot.benchmarkBars, chinaDate(snapshot.asOf))
  for (const item of history) {
    if (item.status !== 'completed' || !item.opinion || !item.inputHash || !Number.isFinite(Date.parse(item.generatedAt)) || Date.parse(item.generatedAt) < Date.parse(item.asOf)) { excluded++; continue }
    const key = `${item.snapshotId}:${item.inputHash}`
    if (seen.has(key)) continue
    seen.add(key)
    const ticker = item.opinion.products[0]?.ticker
    const etf = snapshot.etfs.find(row => row.ticker === ticker)
    if (!etf) { excluded++; continue }
    const adjusted = adjustedBars(etf, chinaDate(snapshot.asOf))
    if (!adjusted.adjusted || adjusted.discontinuity) { excluded++; continue }
    // Use actual generation time, never the historical evidence time of a replay.
    const future = adjusted.bars.filter(bar => Date.parse(`${bar.date}T09:30:00+08:00`) > Date.parse(item.generatedAt))
    const first = future[0], last = future[19]
    if (!first || !last) { pending++; continue }
    const bFirst = benchmark.find(row => row.date === first.date), bLast = benchmark.find(row => row.date === last.date)
    if (!bFirst || !bLast || first.open <= 0 || bFirst.open <= 0) { excluded++; continue }
    const proxyReturnPct = (last.close / first.open - 1) * 100
    samples.push({ inputHash:item.inputHash,ticker,start:first.date,end:last.date,stance:item.opinion.tactical.stance,proxyReturnPct,excessReturnPct:proxyReturnPct-(bLast.close/bFirst.open-1)*100 })
  }
  return { version:1, status:samples.length?'observed':'pending', horizonTradingDays:20, matured:samples.length,pending,excluded,samples,
    performanceWinner:null, basis:'从观点实际生成后的下一开盘观察20交易日，以首个声明产品为领域代理；展示代理涨跌及相对基准变化，不是账户收益、胜率或扣费策略回测。历史快照事后重跑不回填过去收益。' }
}
