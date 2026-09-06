export function evidenceText(value: unknown): string {
  if (typeof value === 'string') {
    try { return JSON.stringify(JSON.parse(value.replace(/^```(?:json)?\s*/, '').replace(/\s*```$/, '')), null, 2) } catch { return value }
  }
  return JSON.stringify(value ?? null, null, 2)
}

export function auditPrompt(messages: Array<{ content: string }>) {
  const text = messages.map(row => row.content).join('\n')
  const placeholders = text.match(/\[object Object\]|\[Array\]|\[Object\]|Array\(\d+\)|\bundefined\b/g) || []
  return { passed: text.trim().length >= 100 && placeholders.length === 0, characters: text.length, numericValues: (text.match(/:\s*-?\d+(?:\.\d+)?/g) || []).length, unexpandedPlaceholders: placeholders, capturedAt: new Date().toISOString() }
}

export function companyEvidence(rows: any[]) {
  const groups=new Map<string,any[]>()
  for(const row of rows.filter(row=>row.marketData||row.financials?.length||row.announcements?.some((a:any)=>a.summary?.length>50))) {
    const key=(row.segment||'未映射')+':'+(row.pool||row.source||'holding');groups.set(key,[...(groups.get(key)||[]),row])
  }
  const selected:any[]=[]
  for(let index=0;selected.length<16;index++) {
    const round=[...groups.values()].flatMap(group=>group[index]?[group[index]]:[])
    if(!round.length)break
    selected.push(...round.slice(0,16-selected.length))
  }
  return selected.map(row => ({
      stockCode: row.stockCode, stockName: row.stockName, source: row.source,
      marketData: row.marketData ? { date: row.marketData.date, price: row.marketData.price, changePct: row.marketData.changePct, source: row.marketData.source } : null, historyPoints: row.indicators?.dataPoints,
      periodChangePct: row.indicators?.periodChangePct, volatility: row.indicators?.volatility,
      maxDrawdown: row.indicators?.maxDrawdown, technicalIndicators: { ma: row.indicators?.indicators?.trend?.ma, rsi12: row.indicators?.indicators?.momentum?.rsi?.rsi12, macd: row.indicators?.indicators?.trend?.macd },
      quality: row.quality,
      financials: [...new Map<string, any>([...(row.financials || [])].sort((a,b) => String(b.period).localeCompare(String(a.period))).map((report: any) => [report.reportType+':'+report.period, report] as [string, any])).values()].slice(0,6).map(report => ({ evidenceId:report.evidenceId,reportType: report.reportType, period: report.period, publishDate: report.publishDate, source: report.source, currency: report.currency, calculated: report.calculated, metrics: Object.fromEntries((report.metrics || []).map((metric: any) => [metric.label, metric.value])) })),
      announcements: (row.announcements || []).slice(0,2),
    }))
}
