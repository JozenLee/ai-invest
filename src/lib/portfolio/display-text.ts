/** Presentation only: archived evidence and model identifiers remain unchanged. */
export function portfolioDisplayText(value: string, names: Record<string, string> = {}): string {
  let result = value.replace(/(?:buyFeeKnown|feeKnown)\s*[:=：]\s*false/g, '费用尚未确认').replace(/(?:buyFeeKnown|feeKnown)\s*[:=：]\s*true/g, '费用已确认')
  for (const [id, name] of Object.entries(names).sort((a, b) => b[0].length - a[0].length)) {
    if (!id || id === name) continue
    const escaped = id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    result = result.replace(new RegExp(`(?<![\\w-])${escaped}(?![\\w-])`, 'g'), () => name)
  }
  const labels: Record<string, string> = {
    'manual/provider': '手工分类或数据商', 'unitNav': '单次净值',
    'risk-reduction': '降低风险', 'cash-repair': '补足现金',
    'hold': '保持现有持仓', 'rules': '规则对照方案',
    'feeKnown': '赎回费用是否已确认', 'buyFeeKnown': '申购费用是否已确认', 'false': '否', 'true': '是',
    'H1': '上半年', 'H2': '下半年', 'Q1': '第一季度', 'Q2': '第二季度', 'Q3': '第三季度', 'Q4': '第四季度',
    'look-through': '底层持仓', 'covariance': '资产联动风险',
    'AI': '人工智能', 'ETF': '指数基金', 'QDII': '境外投资基金',
  }
  for (const [key, label] of Object.entries(labels)) result = result.replace(new RegExp(`\\b${key}\\b`, 'g'), label)
  result = result.replace(/\bP(\d+)\b/g, '备选方案$1').replace(/\bS(\d+)\b/g, '情景$1')
  return result.replace(/情景情景/g, '情景').replace(/方案方案/g, '方案')
}

export function portfolioDisplayData(value: unknown): unknown {
  if (typeof value === 'string') return portfolioDisplayText(value)
  if (Array.isArray(value)) return value.map(portfolioDisplayData)
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, portfolioDisplayData(item)]))
  return value
}
