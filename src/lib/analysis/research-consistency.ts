type Row = Record<string, unknown>
const rows = (value: unknown): Row[] => Array.isArray(value) ? value.filter(item => item && typeof item === 'object') : []

export type ConsistencyIssue = { severity: 'error' | 'warning'; path: string; detail: string }

/** Audit claims against the frozen company packet. Preserve raw model output;
 * unresolved contradictions downgrade the report instead of being hidden. */
export function auditResearchConsistency(value: unknown, companyData: unknown): ConsistencyIssue[] {
  const issues: ConsistencyIssue[] = []
  const companies = rows(companyData)
  const visit = (item: unknown, path: string, company?: Row) => {
    if (Array.isArray(item)) { item.forEach((child,index)=>visit(child,`${path}[${index}]`,company)); return }
    if (item && typeof item === 'object') {
      const row=item as Row
      const matched=companies.find(candidate => (row.code!=null && String(candidate.code || candidate.stockCode) === String(row.code)) || (row.name!=null && String(candidate.name || candidate.stockName) === String(row.name))) || company
      Object.entries(row).forEach(([key,child])=>visit(child,`${path}.${key}`,matched));return
    }
    if (typeof item !== 'string') return
    // Archived sections can themselves be JSON strings. Resolve their own company rows
    // instead of attributing the entire serialized section to the first company named in it.
    if (/^\s*[\[{]/.test(item)) {
      try { const parsed = JSON.parse(item); if (parsed && typeof parsed === 'object') { visit(parsed, path, company); return } } catch { /* Plain narrative remains auditable. */ }
    }
    const matched=company || companies.find(candidate => {
      const name=String(candidate.name || candidate.stockName || '')
      return name.length>1 && item.includes(name)
    })
    if(!matched)return
    const financials=rows(matched.financials)
    const latest=financials.map(report=>String(report.period || '')).sort().at(-1)
    const reports=financials.filter(report=>report.period===latest)
    if(reports.length && reports.every(report=>typeof report.currency==='string' && /^[A-Z]{3}$/.test(report.currency)) && /币种未标注|币种未知/.test(item)) {
      issues.push({severity:'error',path,detail:`${matched.name || matched.stockName}冻结财报已标注币种，正文却称未知`})
    }
    if(latest?.endsWith('06-30') && /H1|半年|上半年/.test(item) && /营收|收入/.test(item)) {
      const raw=reports.flatMap(report=>rows(report.rawMetrics))
      const quarterly=raw.find(metric=>metric.label==='q_sales_yoy')?.value
      const cumulative=raw.find(metric=>metric.label==='tr_yoy')?.value
      if(typeof quarterly==='number' && typeof cumulative==='number' && Math.abs(quarterly-cumulative)>.2) {
        const match=item.match(/(?:营收|收入)[^。；%]{0,24}?([+-]?\d+(?:\.\d+)?)%/)
        if(match && Math.abs(Number(match[1])-quarterly)<.11 && !/单季|Q2|二季度/.test(item)) issues.push({severity:'error',path,detail:`${matched.name || matched.stockName}将单季度营收同比${quarterly}%用于半年累计，累计应为${cumulative}%`})
      }
    }
  }
  let parsed=value
  if(typeof value==='string'){try{parsed=JSON.parse(value)}catch{/* Plain prose is audited as-is. */}}
  visit(parsed,'report')
  return issues
}
