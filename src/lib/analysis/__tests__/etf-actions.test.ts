import { describe, it, expect } from 'vitest'
import { parseETFActions, etfActionsMarkdown } from '../etf-actions'
const bindings = [{ etf_code: '512000', etf_name: '测试ETF' }]
const row = { ticker: '512000', unheldAction: '建仓', heldAction: '加仓', reason: '证据支持', trigger: '趋势确认', invalidation: '盈利转弱', horizon: '一周', evidence: ['交易所 2026-09-04'] }
describe('ETF操作建议', () => {
  it('validates actions and renders both holding scenarios', () => {
    const actions = parseETFActions(JSON.stringify({actions:[row]}), bindings, {status:'available'})
    expect(etfActionsMarkdown(actions)).toContain('未持有：建仓；已持有：加仓')
    expect(actions[0].name).toBe('测试ETF')
  })
  it('fails closed on insufficient data', () => {
    const actions = parseETFActions(JSON.stringify({actions:[row]}), bindings, {status:'limited'})
    expect(actions[0].heldAction).toBe('观望')
    expect(actions[0].unheldAction).toBe('观望')
    expect(parseETFActions(JSON.stringify({actions:[row]}), bindings, {status:'available'}, ['512000'])[0].heldAction).toBe('观望')
  })
  it('rejects missing, duplicate, invented tickers and missing conditions', () => {
    for (const actions of [[], [row,row], [{...row,ticker:'fake'}], [{...row,trigger:''}], [null]]) {
      expect(() => parseETFActions(JSON.stringify({actions}),bindings,{status:'available'})).toThrow()
    }
  })
  it('bounds report evidence while keeping the full archive count visible',()=>{
    const markdown=etfActionsMarkdown([{...row,name:'测试ETF',unheldAction:'建仓' as const,heldAction:'加仓' as const,evidence:Array.from({length:20},(_,i)=>'证据'+i)}])
    expect(markdown).toContain('另有 12 条见本轮证据档案')
    expect(markdown).not.toContain('证据19')
  })
})
