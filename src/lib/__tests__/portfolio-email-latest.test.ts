import { describe,it,expect } from 'vitest'
import { deflateSync } from 'node:zlib'
import { parsePortfolioEmails,parseBalancePdf,parseFundPdf } from '../services/portfolio-email.service'
const pdf=(tokens:string[])=>Buffer.concat([Buffer.from('stream\n'),deflateSync(Buffer.from('BT '+tokens.map(t=>'('+t+')Tj').join(' '))),Buffer.from('\nendstream')])
describe('latest email evidence',()=>{
  it('accepts a real zero balance and reconciles multiple money-market accounts with their total',()=>{
    expect(parseBalancePdf(pdf(['12345678901234567','fund','001010','0.00','12345678901234568','fund','001010','0.00','total','0.00']))).toBe(0)
    expect(parseBalancePdf(pdf(['12345678901234567','fund','001010','125.10','12345678901234568','fund','001010','200.20','total','325.30']))).toBe(325.3)
    expect(parseBalancePdf(pdf(['0.00']))).toBe(0)
    expect(parseBalancePdf(pdf(['5.90']))).toBe(5.9)
  })
  it('rejects inconsistent totals and does not mistake fund holdings for available cash',()=>{
    expect(()=>parseBalancePdf(pdf(['12345678901234567','001010','100.00','total','200.00']))).toThrow('合计不一致')
    expect(()=>parseBalancePdf(pdf(['001634','10','1.2','20261012']))).toThrow('持仓证明')
    expect(parseFundPdf(pdf(['001634','10','1.2','20271012']))).toHaveLength(1)
  })
  it('uses the latest zero-cash attachment, including when it shares an email with holdings',()=>{
    const result=parsePortfolioEmails([
      {subject:'支付宝业务凭证',date:'2026-09-01',text:'',attachments:[pdf(['2000.00'])]},
      {subject:'支付宝业务凭证',date:'2026-10-13',text:'',attachments:[pdf(['001634','20','1.3','20261012']),pdf(['0.00'])]},
    ])
    expect(result.cashBalance).toBe(0);expect(result.balanceDate).toBe('2026-10-13')
  })
  it('selects the newest valid holding and balance emails independently',()=>{
    const message=(date:string,attachment:Buffer)=>({subject:'支付宝业务凭证',date,text:'',attachments:[attachment]})
    const result=parsePortfolioEmails([
      message('2026-09-01',pdf(['001634','10','1.2','2026-09-01'])),
      message('2026-09-01',pdf(['1000.00'])),
      message('2026-09-04',pdf(['001634','20','1.3','2026-09-04'])),
      message('2026-09-04',pdf(['2000.00'])),
    ])
    expect(result.holdings[0].quantity).toBe(20);expect(result.cashBalance).toBe(2000)
  })
})
