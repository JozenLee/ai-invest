/* eslint-disable @typescript-eslint/no-explicit-any -- This module normalizes heterogeneous frozen provider payloads at the AI boundary. */
export function evidenceText(value: unknown): string {
  if (typeof value === 'string') {
    try { return JSON.stringify(JSON.parse(value.replace(/^```(?:json)?\s*/, '').replace(/\s*```$/, '')), null, 2) } catch { return value }
  }
  return JSON.stringify(value ?? null, null, 2)
}

export function auditPrompt(messages: Array<{ content: string }>,maxCharacters=40_000) {
  const text = messages.map(row => row.content).join('\n')
  const placeholders = text.match(/\[object Object\]|\[Array\]|\[Object\]|Array\(\d+\)|\bundefined\b/g) || []
  return { passed: text.trim().length >= 100 && text.length<=maxCharacters&&placeholders.length === 0, characters: text.length,maxCharacters,overBudgetBy:Math.max(0,text.length-maxCharacters), numericValues: (text.match(/:\s*-?\d+(?:\.\d+)?/g) || []).length, unexpandedPlaceholders: placeholders, capturedAt: new Date().toISOString() }
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

const numeric=(value:unknown):value is number=>typeof value==='number'&&Number.isFinite(value)
const median=(values:number[])=>{
  if(!values.length)return null
  const sorted=[...values].sort((a,b)=>a-b),middle=Math.floor(sorted.length/2)
  return sorted.length%2?sorted[middle]:(sorted[middle-1]+sorted[middle])/2
}
const robust=(values:number[])=>{
  if(!values.length)return {median:null,min:null,max:null}
  const sorted=[...values].sort((a,b)=>a-b),low=sorted[Math.floor((sorted.length-1)*.05)],high=sorted[Math.ceil((sorted.length-1)*.95)]
  const winsorized=sorted.map(value=>Math.min(high,Math.max(low,value)))
  return {median:median(winsorized),min:sorted[0],max:sorted.at(-1)!}
}

/** Aggregate the complete company universe before selecting a bounded set of
 * examples. The model receives breadth and dispersion instead of inferring an
 * industry from whichever two rows happened to rank first. */
export function companyResearchPacket(rows:any[]){
  const eligible=rows.filter(row=>row&&typeof row==='object')
  const grouped=new Map<string,any[]>()
  for(const row of eligible){const key=String(row.segment||'未映射');grouped.set(key,[...(grouped.get(key)||[]),row])}
  const aggregates=[...grouped.entries()].map(([segment,companies])=>{
    const profit=companies.map(row=>row.profitGrowthPct).filter(numeric)
    const cash=companies.map(row=>row.cashConversionPct).filter(numeric)
    const profitStats=robust(profit),cashStats=robust(cash),minimumSample=5
    const mapped=companies.filter(row=>row.matchConfidence>=.7||(row.representativeEtfs||[]).some((item:any)=>item.holdingVerified)).length
    return {
      segment,companyCount:companies.length,mappedCompanyCount:mapped,
      multiPeriodFinancialCount:companies.filter(row=>(row.financialPeriods||0)>=2).length,
      profitGrowthKnown:profit.length,positiveProfitGrowth:profit.filter(value=>value>0).length,medianProfitGrowthPct:profit.length>=minimumSample?profitStats.median:null,profitGrowthRangePct:[profitStats.min,profitStats.max],
      cashQualityKnown:cash.length,healthyCashConversion:cash.filter(value=>value>=50).length,medianCashConversionPct:cash.length>=minimumSample?cashStats.median:null,cashConversionRangePct:[cashStats.min,cashStats.max],
      sampleStatus:Math.min(profit.length,cash.length)>=minimumSample?'可用于环节聚合':'小样本，仅展示范围，不得作为环节中位数结论',minimumSample,
      evidenceIds:[...new Set(companies.flatMap(row=>row.evidenceIds||[]))].slice(0,16),
    }
  }).sort((a,b)=>b.companyCount-a.companyCount||a.segment.localeCompare(b.segment,'zh-CN'))
  const selected=companyEvidence(eligible).slice(0,10)
  return {
    coverage:{companyCount:eligible.length,multiPeriodFinancialCount:eligible.filter(row=>(row.financialPeriods||0)>=2).length,profitGrowthKnown:eligible.filter(row=>numeric(row.profitGrowthPct)).length,cashQualityKnown:eligible.filter(row=>numeric(row.cashConversionPct)).length,segmentCount:grouped.size,evidenceIds:[...new Set(eligible.flatMap(row=>row.evidenceIds||[]))].slice(0,24)},
    segmentAggregates:aggregates.slice(0,12),representativeCompanies:selected,
    boundary:'聚合指标覆盖完整冻结企业池；“ETF持仓补充样本（图谱外）”表示真实披露持仓但不属于当前图谱核心节点，不是数据缺失。代表企业仅用于解释分化，不代表个股推荐。至少5个有效样本才展示经5%/95%去极值后的环节中位数；小样本只展示范围。ETF持仓权重另由产品规则计算。',
  }
}
