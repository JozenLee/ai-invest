type Row = Record<string, unknown>
const record = (value: unknown): Row => value && typeof value === 'object' && !Array.isArray(value) ? value as Row : {}
const rows = (value: unknown): Row[] => Array.isArray(value) ? value.map(record) : []
export type FinancialFact = { code: string; name: string; period: string; metric: 'cashConversionPct' | 'profitGrowthPct'; value: number; unit: '%'; basis: string; evidenceIds: string[] }

/** The same frozen calculated values back both breadth and narrative. Reported
 * growth fields may use a different profit definition and are not interchangeable. */
export function financialFacts(value: unknown): FinancialFact[] {
  return rows(value).flatMap(company => {
    const reports = rows(company.financials)
    const period = String(company.financialPeriod || '') || reports.map(row => String(row.period || '')).sort().at(-1) || ''
    const evidenceIds = reports.filter(row => row.period === period).map(row => String(row.evidenceId || '')).filter(Boolean)
    return (['cashConversionPct', 'profitGrowthPct'] as const).flatMap(metric => {
      const number = company[metric]
      return typeof number === 'number' && Number.isFinite(number) && period ? [{
        code: String(company.code || company.stockCode || ''), name: String(company.name || company.stockName || ''),
        period, metric, value: number, unit: '%' as const, evidenceIds,
        basis: metric === 'cashConversionPct' ? String(company.cashConversionBasis || '冻结企业现金转化率；归档未记录公式时不得推定利润口径') : String(company.profitGrowthBasis || '冻结企业利润同比；归档未记录公式时不得推定为归母或扣非增速'),
      }] : []
    })
  })
}

export function compactFinancialFacts(value: unknown) {
  return Object.fromEntries(financialFacts(value).filter(fact=>fact.metric==='cashConversionPct').map(fact=>[fact.code,{name:fact.name,period:fact.period,cashConversionPct:Number(fact.value.toFixed(2))}]))
}

/** Audit current cash-conversion facts, not hypothetical targets or historical
 * comparisons. Never silently replace a number after the model has reasoned on it. */
export function auditFinancialFacts(value: unknown, facts: FinancialFact[]): string[] {
  const issues = new Set<string>()
  const cash = facts.filter(fact => fact.metric === 'cashConversionPct' && fact.name)
  const visit = (item: unknown, inheritedName = '') => {
    if (typeof item === 'string') {
      for (const sentence of item.split(/[。；;\n]/u)) {
        if (/预计|假设|改善至|目标|若.*(?:升|降)至/u.test(sentence)) continue
        const mentions = cash.flatMap(fact => {
          const occurrences: Array<{fact:FinancialFact;index:number}> = []
          let index = sentence.indexOf(fact.name)
          while (index >= 0) { occurrences.push({ fact, index }); index = sentence.indexOf(fact.name, index + fact.name.length) }
          return occurrences
        }).sort((a, b) => a.index - b.index)
        if (!mentions.length && inheritedName) {
          const fact = cash.find(row => row.name === inheritedName || row.code === inheritedName)
          if (fact) mentions.push({ fact, index: 0 })
        }
        // “甲和乙分别为x和y” assigns values in name order, not to the last name.
        const distributed = sentence.match(/(?:(?:现金|经营现金流)?转化率|经营现金流(?:占利润比|\/净利润)|现金流占利润比)分别(?:为|是)?([^，,。；]+)/u)
        let distributedStart = -1, distributedEnd = -1
        if (distributed) {
          const offset = distributed.index || 0
          const clauseStart = Math.max(sentence.lastIndexOf('，', offset), sentence.lastIndexOf(',', offset)) + 1
          const names = mentions.filter(row => row.index >= clauseStart && row.index < offset)
          const values = [...distributed[1].matchAll(/(-?\d+(?:\.\d+)?)\s*[%％]/gu)]
          if (names.length >= 2 && names.length === values.length) {
            names.forEach(({fact}, index) => {
              const dates = sentence.slice(clauseStart, offset).match(/20\d{2}[-年]\d{1,2}(?:[-月]\d{1,2})?/gu)
              if (dates?.some(date => !fact.period.startsWith(date.replace('年', '-').replace('月', '-')))) return
              const value = values[index][1], tolerance = value.includes('.') ? .11 : .51
              if (Math.abs(Number(value) - fact.value) > tolerance) issues.add(`${fact.name} ${fact.period}现金转化率为${fact.value.toFixed(2)}%，正文写为${value}%；须按冻结口径重新推理`)
            })
            distributedStart = clauseStart; distributedEnd = offset + distributed[0].length
          }
        }
        for (let i = 0; i < mentions.length; i++) {
          const { fact, index } = mentions[i]
          if (index >= distributedStart && index < distributedEnd) continue
          const part = sentence.slice(index, mentions[i + 1]?.index)
          const dates = part.match(/20\d{2}[-年]\d{1,2}(?:[-月]\d{1,2})?/gu)
          if (dates?.some(date => !fact.period.startsWith(date.replace('年', '-').replace('月', '-')))) continue
          let match = part.match(/(?:(?:现金)?转化率|经营现金流(?:占利润比|\/净利润)|现金流占利润比)[^\d%％。；+\-]{0,10}(-?\d+(?:\.\d+)?)\s*[%％]/u)
          if(match){
            const tail=part.slice((match.index||0)+match[0].length)
            const range=tail.match(/^\s*(?:-|—|～|至|到)\s*(-?\d+(?:\.\d+)?)\s*[%％]/u)
            if(range){
              // A joint range is not a claim that the last named company has
              // the range's lower endpoint. Compare the whole named sample.
              const values=mentions.map(row=>row.fact.value)
              if(values.length>=2&&(Math.abs(Math.min(...values)-Number(match[1]))>.51||Math.abs(Math.max(...values)-Number(range[1]))>.51))issues.add(`现金转化率区间${match[1]}%—${range[1]}%与所列企业冻结口径不一致`)
              continue
            }
          }
          if(!match&&/现金转化|现金流占利润比|转化率/u.test(sentence))match=part.slice(fact.name.length).match(/^\s*(-?\d+(?:\.\d+)?)\s*[%％]/u)
          if (match && /低于|小于|不足|不到|高于|超过|大于|至少|不低于|至多|不超过|不高于/u.test(match[0])) {
            const threshold = Number(match[1]), phrase = match[0]
            const valid = /不低于|至少/u.test(phrase) ? fact.value >= threshold : /不超过|不高于|至多/u.test(phrase) ? fact.value <= threshold
              : /低于|小于|不足|不到/u.test(phrase) ? fact.value < threshold : fact.value > threshold
            if (!valid) issues.add(`${fact.name}现金转化率${fact.value.toFixed(2)}%不满足正文比较条件${match[0]}`)
            continue
          }
          if (match && Math.abs(Number(match[1]) - fact.value) > (match[1].includes('.') ? 0.11 : 0.51)) {
            issues.add(`${fact.name} ${fact.period}现金转化率为${fact.value.toFixed(2)}%，正文写为${match[1]}%；须按冻结口径重新推理`)
          }
        }
      }
    } else if (Array.isArray(item)) item.forEach(row => visit(row, inheritedName))
    else if (item && typeof item === 'object') {
      const row = record(item), name = String(row.name || row.code || inheritedName)
      for (const [key, child] of Object.entries(row)) if (!['historyComparison', 'historicalReportContext'].includes(key)) visit(child, name)
    }
  }
  visit(value)
  return [...issues]
}

export function validateFinancialFacts(value: unknown, facts: FinancialFact[]) {
  const issues = auditFinancialFacts(value, facts)
  if (issues.length) throw new Error(`数值事实校验失败：${issues.join('；')}`)
}
