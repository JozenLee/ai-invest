export function freshEvidence(date: unknown, days = 7, now = Date.now()) {
  const timestamp = Date.parse(String(date || ''))
  return Number.isFinite(timestamp) && timestamp <= now && now - timestamp <= days * 86400000
}

export function financialRatios(metrics: Array<{ label: string; value: unknown }>) {
  const number = (label: string) => {
    const value = metrics.find(row => row.label === label)?.value
    return value !== null && value !== undefined && value !== '' && Number.isFinite(Number(value)) ? Number(value) : null
  }
  const ratio = (numerator: string, denominator: string) => {
    const a = number(numerator), b = number(denominator)
    return a !== null && b !== null && b > 0 ? a / b * 100 : null
  }
  return { netMarginPct: ratio('净利润', '营业收入'), debtToAssetsPct: ratio('总负债', '总资产'), operatingCashToProfitPct: ratio('经营现金流', '净利润'), basis: '同一报表同币种指标比值；缺失或非正分母不计算' }
}

export function summarizeMarketReference(snapshot: { data: unknown; stale: boolean; source: string | null; dataDate: string | null; fetchedAt: string } | null) {
  if (!snapshot || snapshot.stale) return { available: false, reason: '缺失或过期的市场参考数据已剔除' }
  const rows = (Array.isArray(snapshot.data) ? snapshot.data : [snapshot.data]) as Record<string, unknown>[]
  const groups = new Map<string, Record<string, unknown>[]>()
  for (const row of rows) {
    if (!row || typeof row !== 'object') continue
    const date = String(row.trade_date || row.date || row['日期'] || '').replace(/^(\d{4})(\d{2})(\d{2})$/, '$1-$2-$3')
    if (!freshEvidence(date, 14)) continue
    const id = String(row.exchange_id || row.ts_code || 'market')
    groups.set(id, [...(groups.get(id) || []), { ...row, date }])
  }
  const fields = ['net_amount', 'net_amount_rate', 'buy_elg_amount', 'buy_lg_amount', 'rzye', 'rqye', 'rzrqye', 'rzmre', 'rzche']
  const data = [...groups].map(([id, records]) => {
    const unique = [...new Map(records.map(row => [String(row.date), row])).values()].sort((a,b) => String(b.date).localeCompare(String(a.date)))
    const latest = unique[0], previous = unique[1]
    const metrics = fields.flatMap(field => {
      const current = latest?.[field], prior = previous?.[field]
      if (current == null || current === '' || !Number.isFinite(Number(current))) return []
      return [{ field, value: Number(current), previousDate: previous?.date || null, delta: prior != null && prior !== '' && Number.isFinite(Number(prior)) ? Number(current) - Number(prior) : null }]
    })
    return { id, exchangeName: ({ BSE: '北京证券交易所（不是深交所）', SSE: '上海证券交易所', SZSE: '深圳证券交易所' } as Record<string,string>)[id] || id, date: latest.date, sampleCount: unique.length, metrics }
  }).filter(row => row.metrics.length)
  return { available: data.length > 0, source: snapshot.source, dataDate: snapshot.dataDate, units: '保留源字段单位；delta为相邻有效记录差值，不跨交易所求和', data }
}
