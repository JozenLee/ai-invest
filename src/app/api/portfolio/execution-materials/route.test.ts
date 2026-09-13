import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'
const db=vi.hoisted(()=>({portfolio:{findFirst:vi.fn()},rawPayload:{findMany:vi.fn(),create:vi.fn()},$transaction:vi.fn()}))
vi.mock('@/lib/db/prisma',()=>({default:db}))
import { GET, POST } from './route'

const now='2026-09-11T02:00:00Z'
const evidence={id:'user-receipt:1',source:'用户提供的销售渠道费率及份额确认记录',url:null,locator:'渠道记录第1页，已核对当前C类份额',observedAt:'2026-09-11T01:00:00Z',publishedAt:null,dataDate:'2026-09-11'}
const fact=<T>(value:T)=>({value,evidence,validUntil:'2026-09-12T02:00:00Z'})
const material=()=>({ticker:'026633',productType:'active',asOf:now,side:'sell',otc:{channel:'渠道',status:fact('open'),cutoff:fact('开放日15时，超时顺延'),settlement:fact({confirmation:'T+1',cashArrival:'T+3',cashArrivalBusinessDays:3}),redemptionQuantity:50,lots:[{id:'lot-1',quantity:100,acquiredAt:'2026-08-01',evidence,fee:fact({ratePct:0,fixedAmount:0})}]}})
const request=(body:unknown,origin='http://localhost:3000')=>new NextRequest('http://localhost:3000/api/portfolio/execution-materials',{method:'POST',headers:{origin,'content-type':'application/json'},body:JSON.stringify(body)})
let rows:Array<{id:string;targetCode:string;payload:string;fetchedAt:string}>
let portfolio:{id:string;holdings:Array<{ticker:string;name:string;quantity:number}>}
beforeEach(()=>{
  vi.useFakeTimers();vi.setSystemTime(now);vi.clearAllMocks();rows=[]
  portfolio={id:'account-a',holdings:[{ticker:'026633',name:'平安半导体领航精选混合C',quantity:100}]}
  db.portfolio.findFirst.mockImplementation(async()=>portfolio)
  db.rawPayload.findMany.mockImplementation(async(q)=>q.where.datasetKey==='fund_execution'?rows:[])
  db.rawPayload.create.mockImplementation(async({data})=>{const row={...data,id:'raw-'+rows.length,fetchedAt:now};rows.unshift(row);return row})
  db.$transaction.mockImplementation(async(fn)=>fn(db))
})
afterEach(()=>vi.useRealTimers())

describe('private execution materials API',()=>{
  it('appends a validated version and preserves the other side, without changing holdings',async()=>{
    expect((await POST(request(material()))).status).toBe(201)
    const buy={...material(),side:'buy',otc:{...material().otc,subscriptionFee:fact({ratePct:0,fixedAmount:0})}}
    expect((await POST(request(buy))).status).toBe(201)
    expect(db.rawPayload.create).toHaveBeenCalledTimes(2)
    const saved=JSON.parse(rows[0].payload)
    expect(saved.portfolioId).toBe('account-a')
    expect(saved.data.sell.otc.lots[0].fee.evidence.observedAt).toBe(evidence.observedAt)
    expect(saved.data.buy.otc.subscriptionFee.value.ratePct).toBe(0)
    expect(saved.provenance).toBe('user-provided-supporting-records')
    const response=await GET(new NextRequest('http://localhost:3000/api/portfolio/execution-materials?ticker=026633'))
    expect(response.headers.get('Cache-Control')).toBe('private, no-store')
    const body=await response.json()
    expect(body.records).toHaveLength(1)
    expect(body.records[0].checks.sell.informationReady).toBe(true)
    expect(portfolio.holdings[0].quantity).toBe(100)
  })
  it('rejects cross-site reads/writes before touching the database',async()=>{
    expect((await POST(request(material(),'https://attacker.test'))).status).toBe(403)
    expect((await GET(new NextRequest('http://localhost:3000/api/portfolio/execution-materials',{headers:{origin:'https://attacker.test'}}))).status).toBe(403)
    expect(db.portfolio.findFirst).not.toHaveBeenCalled()
    expect(db.$transaction).not.toHaveBeenCalled()
  })
  it('rejects unknown positions, wrong product types, missing provenance, expired fees and excess shares',async()=>{
    const bad=material();bad.otc.lots[0].fee.evidence={...evidence,source:''}
    const expired=material();expired.otc.lots[0].fee.validUntil='2026-09-10T00:00:00Z'
    const excess=material();excess.otc.redemptionQuantity=101
    for(const body of [{...material(),ticker:'017470'},{...material(),productType:'etf'},bad,expired,excess])expect((await POST(request(body))).status).toBe(400)
    expect(db.rawPayload.create).not.toHaveBeenCalled()
  })
  it('does not expose another account and rechecks quantity/time on read',async()=>{
    await POST(request(material()))
    rows.unshift({id:'foreign',targetCode:'026633',payload:JSON.stringify({portfolioId:'account-b',data:{sell:material()}}),fetchedAt:now})
    portfolio.holdings[0].quantity=25
    const body=await (await GET(new NextRequest('http://localhost:3000/api/portfolio/execution-materials'))).json()
    expect(body.records).toHaveLength(1)
    expect(body.records[0].id).not.toBe('foreign')
    expect(body.records[0].checks.sell.informationReady).toBe(false)
  })
})
