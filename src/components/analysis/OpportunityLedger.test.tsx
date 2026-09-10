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
