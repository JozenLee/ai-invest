import { describe,it,expect } from 'vitest'
import { deflateSync } from 'node:zlib'
import { parsePortfolioEmails } from '../services/portfolio-email.service'
const pdf=(tokens:string[])=>Buffer.concat([Buffer.from('stream\n'),deflateSync(Buffer.from('BT '+tokens.map(t=>'('+t+')Tj').join(' '))),Buffer.from('\nendstream')])
describe('latest email evidence',()=>{
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
