import { render, screen } from '@testing-library/react'
import { expect, it } from 'vitest'
import { OpportunityLedger } from './OpportunityLedger'
import { buildOpportunityLedger } from '@/lib/analysis/opportunity-ledger'

it('shows verification and disclosure boundaries without presenting a trading instruction', () => {
  const items=buildOpportunityLedger({asOf:'2026-09-10T05:00:00Z',news:{catalysts:[{event:'存储订单',affectedCompanies:['688008'],conditions:'验证订单回款',invalidation:'订单取消时复核'}]},events:[{id:'e',title:'存储订单',status:'evidence',publishedAt:'2026-09-09',evidenceIds:['source']}],holdings:[{code:'688008',etfCode:'159995',weight:7.33,period:'2026-06-30',evidenceId:'holding'}],decisions:[],graph:{}})
  render(<OpportunityLedger items={items}/>)
  expect(screen.getByRole('region',{name:'机会跟踪与验证'})).toBeTruthy()
  expect(screen.getByText('验证条件：验证订单回款')).toBeTruthy()
  expect(screen.getByText(/7.33%/)).toBeTruthy()
  expect(screen.getByText(/不代表实时权重/)).toBeTruthy()
  expect(screen.queryByText('建仓')).toBeNull()
})

it('keeps the current review concise and collapses older opportunities', () => {
  const current=buildOpportunityLedger({asOf:'2026-09-10T05:00:00Z',news:{catalysts:[{event:'存储订单',affectedCompanies:['688008'],conditions:'验证订单回款'}]},events:[],holdings:[],decisions:[],graph:{}})[0]
  const previous={...current,id:'previous',title:'历史液冷机会',reviewedAt:'2026-09-09T05:00:00Z'}
  const {container}=render(<OpportunityLedger items={[previous,current]}/>)
  expect(screen.getByText('本轮复核 1 项。来源新增不等于超预期，持仓关联不等于收益兑现。展开查看验证条件与证据变化。')).toBeTruthy()
  expect(screen.getByText('历史机会 1 项（展开复核）')).toBeTruthy()
  expect(container.querySelector('details:not([open]) summary')?.textContent).toContain('存储订单')
})
