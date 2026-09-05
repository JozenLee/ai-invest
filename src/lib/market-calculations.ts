export function calculateVolumeAmplification(rows: Array<Record<string, unknown>>) {
  const unique = new Map(rows.map(row => [String(row.trade_date || row.date || ''), row]))
  const valid = [...unique.values()].filter(row => typeof row.amount === 'number' && Number.isFinite(row.amount) && row.amount > 0).sort((a,b) => String(a.trade_date || a.date).localeCompare(String(b.trade_date || b.date)))
  if (valid.length < 21) return null
  const current = Number(valid.at(-1)!.amount)
  const average = valid.slice(-21,-1).reduce((sum,row) => sum + Number(row.amount),0) / 20
  return { currentVolume: current / 100000, avgVolume: average / 100000, amplification: current / average, isAmplified: current / average >= 1.5, date: String(valid.at(-1)!.trade_date || valid.at(-1)!.date), sampleCount: 20, unit: '亿元' }
}
