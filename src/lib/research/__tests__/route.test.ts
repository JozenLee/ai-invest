import {describe,it,expect,vi,beforeEach} from 'vitest'
import {NextRequest} from 'next/server'
import {fixture} from './fixtures'
const mocks=vi.hoisted(()=>({capture:vi.fn(),persist:vi.fn(),previous:vi.fn(),read:vi.fn()}))
vi.mock('@/lib/db',()=>({prisma:{}}))
vi.mock('../store',()=>({captureResearchSnapshot:mocks.capture,persistEvaluation:mocks.persist,latestEvaluation:mocks.previous,readSnapshot:mocks.read,getResearchProfile:vi.fn(),saveResearchProfile:vi.fn()}))
vi.mock('../schedule',()=>({getResearchSchedule:vi.fn(),saveResearchSchedule:vi.fn()}))
import {POST} from '@/app/api/research/[industryId]/route'
const context={params:Promise.resolve({industryId:'ai'})}
function request(body:unknown,origin='http://localhost:3000') {return new NextRequest('http://0.0.0.0:3000/api/research/ai',{method:'POST',headers:{host:'localhost:3000',origin,'content-type':'application/json'},body:JSON.stringify(body)})}
beforeEach(()=>{vi.clearAllMocks();mocks.capture.mockResolvedValue(fixture());mocks.previous.mockResolvedValue(null);mocks.persist.mockResolvedValue({snapshotId:'snapshot-one'});mocks.read.mockResolvedValue(fixture())})
describe('local research API',()=>{
  it('accepts same-origin requests behind Next internal host normalization',async()=>{
    const r=await POST(request({action:'evaluate'}),context);expect(r.status).toBe(201);expect(mocks.capture).toHaveBeenCalledWith('ai')
  })
  it('rejects cross-origin and malformed origins before writing',async()=>{
    expect((await POST(request({action:'evaluate'},'https://attacker.test'),context)).status).toBe(403)
    expect((await POST(request({action:'evaluate'},'not-a-url'),context)).status).toBe(403)
    expect(mocks.persist).not.toHaveBeenCalled()
  })
  it('forbids backdating and cross-domain snapshot replay',async()=>{
    expect((await POST(request({action:'evaluate',asOf:'2020-01-01'}),context)).status).toBe(400)
    mocks.read.mockResolvedValue({...fixture(),profile:{...fixture().profile,industryId:'other'}})
    expect((await POST(request({action:'inspect',snapshotId:'snapshot-one'}),context)).status).toBe(400)
  })
})
