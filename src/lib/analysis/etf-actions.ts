export type ETFAction = {
  ticker: string; name: string; unheldAction: '建仓' | '观望'; heldAction: '加仓' | '持有' | '减仓' | '清仓' | '观望';
  reason: string; trigger: string; invalidation: string; horizon: string; evidence: string[]
  confidencePct?: number
  ruleAction?: { unheld: '建仓' | '观望'; held: '持有' | '减仓' | '观望' }
}
export function parseETFActions(text: string, bindings: Array<{ etf_code: string; etf_name: string }>, quality: { status?: string } | undefined, unusableTickers: string[] = []): ETFAction[] {
  const value = JSON.parse(text.trim().replace(/^```(?:json)?\s*/, '').replace(/\s*```$/, ''))
  if (!Array.isArray(value.actions)) throw new Error('ETF操作分析缺少actions数组')
  const codes = new Set(bindings.map(row => row.etf_code))
  if (value.actions.some((row: unknown) => !row || typeof row !== 'object') || value.actions.length !== codes.size || new Set(value.actions.map((row: ETFAction) => row.ticker)).size !== codes.size) throw new Error('ETF操作分析必须覆盖每个标的且不得重复')
  return value.actions.map((row: ETFAction) => {
    if (!codes.has(row.ticker) || !['建仓','观望'].includes(row.unheldAction) || !['加仓','持有','减仓','清仓','观望'].includes(row.heldAction) || !['reason','trigger','invalidation','horizon'].every(key => typeof row[key as keyof ETFAction] === 'string' && String(row[key as keyof ETFAction]).trim()) || !Array.isArray(row.evidence) || !row.evidence.length || !row.evidence.every(item => typeof item === 'string' && item.trim())) throw new Error('ETF操作分析缺少有效操作、条件或证据')
    const guarded = quality?.status !== 'available' || unusableTickers.includes(row.ticker)
    return { ...row, name: bindings.find(item => item.etf_code === row.ticker)!.etf_name,
      ...(guarded ? { unheldAction: '观望' as const, heldAction: '观望' as const, reason: '数据质量不足，暂不形成交易操作。' + row.reason } : {}) }
  })
}
export function etfActionsMarkdown(actions: ETFAction[]) {
  return '## ETF技术规则对照\n\n以下是技术策略的原始意图，供研究与前向比较；均线条件不直接决定账户仓位。资金方案须结合投资假设、实际基金暴露、成本和账户硬约束另行比较。\n\n' + actions.map(row => {
    const shown=row.evidence.slice(0,8),more=row.evidence.length-shown.length
    const raw=row.ruleAction&&row.ruleAction.unheld!==row.unheldAction||row.ruleAction&&row.ruleAction.held!==row.heldAction?`\n\n原始规则意图：未持有 ${row.ruleAction?.unheld}；已持有 ${row.ruleAction?.held}（仅用于回放验证，不授权执行）`:''
    return `### ${row.name}（${row.ticker}）\n\n决策证据覆盖度：${typeof row.confidencePct==='number'?`${row.confidencePct}/100`:'按报告页实时计算'}\n\n未持有：${row.unheldAction}；已持有：${row.heldAction}${raw}\n\n依据：${row.reason}\n\n复核条件：${row.trigger}\n\n失效条件：${row.invalidation}\n\n观察周期：${row.horizon}\n\n代表性证据：${shown.join('；')}${more>0?`；另有 ${more} 条见本轮证据档案`:''}`
  }).join('\n\n') + '\n\n实验性研究工具，不构成投资建议，不保证收益。'
}
