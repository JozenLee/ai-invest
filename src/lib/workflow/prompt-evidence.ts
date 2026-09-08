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
  const candidates=rows.filter(row=>row.marketData||row.financials?.length||row.announcements?.some((a:any)=>a.summary?.length>50)).sort((a,b)=>{
    const mappedA=(a.representativeEtfs||[]).filter((item:any)=>item.holdingVerified).length,mappedB=(b.representativeEtfs||[]).filter((item:any)=>item.holdingVerified).length
    const qualityA=(a.financialPeriods||0)+(a.announcementCount||0)*0.25,qualityB=(b.financialPeriods||0)+(b.announcementCount||0)*0.25
    return mappedB-mappedA+(b.representativenessScore||0)-(a.representativenessScore||0)+qualityB-qualityA
  })
  for(const row of candidates) {
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
      graphMapping: row.matchSource || row.segmentCode ? { stage: row.stage, stageCode: row.stageCode, segment: row.segment, segmentCode: row.segmentCode, source: row.matchSource, matchConfidence: row.matchConfidence, representativenessScore: row.representativenessScore, selectionReason: row.selectionReason, representativeEtfs: row.representativeEtfs, representativeIndices: row.representativeIndices } : undefined,
      marketData: row.marketData ? { date: row.marketData.date, price: row.marketData.price, changePct: row.marketData.changePct, source: row.marketData.source } : null, historyPoints: row.indicators?.dataPoints,
      periodChangePct: row.indicators?.periodChangePct, volatility: row.indicators?.volatility,
      maxDrawdown: row.indicators?.maxDrawdown, technicalIndicators: { ma: row.indicators?.indicators?.trend?.ma, rsi12: row.indicators?.indicators?.momentum?.rsi?.rsi12, macd: row.indicators?.indicators?.trend?.macd },
      quality: row.quality, financialGaps: row.financialGaps,
      financials: [...new Map<string, any>([...(row.financials || [])].sort((a,b) => String(b.period).localeCompare(String(a.period))).map((report: any) => [report.reportType+':'+report.period, report] as [string, any])).values()].slice(0,6).map(report => ({ evidenceId:report.evidenceId,reportType: report.reportType, period: report.period, publishDate: report.publishDate, source: report.source, currency: report.currency, calculated: report.calculated, metrics: Object.fromEntries((report.metrics || []).map((metric: any) => [metric.label, metric.value])) })),
      announcements: (row.announcements || []).slice(0,2),
    }))
}
