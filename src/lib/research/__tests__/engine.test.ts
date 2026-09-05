import {describe,it,expect} from 'vitest'
import {fixture} from './fixtures'
import {evaluateResearch,adjustedBars} from '../engine'
import {sessionBoundary,dateKey,visibleAt,nextReview} from '../time'
import {clusterEvents} from '../events'
import {validateProfile} from '../profile'
import {replayResearch} from '../replay'

describe('P0 point-in-time evidence',()=>{
  it('uses explicit holidays and the previous close before market close',()=>{
    const calendar=[{date:'2026-09-04',open:true},{date:'2026-09-05',open:false},{date:'2026-09-06',open:false},{date:'2026-09-07',open:false},{date:'2026-09-08',open:true}]
    expect(sessionBoundary(calendar,'2026-09-08T04:00:00Z').expectedSession).toBe('2026-09-04')
    expect(sessionBoundary(calendar,'2026-09-08T08:00:00Z').expectedSession).toBe('2026-09-08')
    expect(sessionBoundary(calendar,'2026-09-09T08:00:00Z').verified).toBe(false)
  })
  it('rejects invalid calendar dates and future evidence',()=>{
    expect(dateKey('20260230')).toBeNull();expect(dateKey('20260904')).toBe('2026-09-04')
    expect(visibleAt('2026-09-01','2026-09-05','2026-09-04')).toBe(false)
    expect(visibleAt(null,'2026-09-01','2026-09-04')).toBe(false)
    expect(nextReview([],'2026-09-04T08:00:00Z')).toBe('2026-09-04T08:00:00Z')
  })
  it('adjusts a split only with complete factors and preserves raw price',()=>{
    const e=fixture().etfs[0];e.bars=e.bars.map((b,i)=>i<80?{...b,open:b.open*2,high:b.high*2,low:b.low*2,close:b.close*2}:b)
    e.factors=e.bars.map((b,i)=>({date:b.date,factor:i<80?1:2}))
    const result=adjustedBars(e,'2026-09-04')
    expect(result.discontinuity).toBe(false);expect(result.raw[0].close).toBe(200);expect(result.bars[0].close).toBe(100)
    e.factors.pop();expect(adjustedBars(e,'2026-09-04').adjusted).toBe(false)
  })
  it('does not let one bad ETF freeze a healthy ETF',()=>{
    const s=fixture(),bad=structuredClone(s.etfs[0]);bad.ticker='159996';bad.factors=[];s.etfs.push(bad)
    const e=evaluateResearch(s);expect(e.decisions[0].state).toBe('eligible');expect(e.decisions[1].state).toBe('blocked');expect(e.decisions[1].heldAction).toBe('观望')
  })
  it('blocks mismatched dates and unavailable calendars',()=>{
    const s=fixture();s.etfs[0].bars.pop();expect(evaluateResearch(s).decisions[0].state).toBe('blocked')
    s.calendar=[];expect(evaluateResearch(s).calendarVerified).toBe(false)
  })
  it('does not use future ETF candles',()=>{
    const s=fixture(),before=evaluateResearch(s);s.etfs[0].bars.push({...s.etfs[0].bars[0],date:'2026-12-01',close:9999})
    expect(evaluateResearch(s)).toEqual(before)
  })
})
describe('P1 mapping and representative evidence',()=>{
  it('deduplicates the same index for breadth',()=>{
    const s=fixture();s.etfs.push({...structuredClone(s.etfs[0]),ticker:'159996'})
    expect(evaluateResearch(s).indexBreadth.mappedIndices).toBe(1)
    s.etfs[1].indexBars=[];expect(evaluateResearch(s).indexBreadth.usableIndices).toBe(1)
  })
  it('requires all configured sectors on all flow sessions',()=>{
    const s=fixture();s.profile.sectors.push('通信设备');const d=evaluateResearch(s).decisions[0]
    expect(d.metrics.flowSum).toBeNull();expect(d.state).toBe('watch')
  })
  it('deduplicates intraday sector snapshots instead of multiplying flow',()=>{
    const s=fixture();s.sectorFlows.push(...s.sectorFlows);expect(evaluateResearch(s).decisions[0].metrics.flowSum).toBe(50000000);expect(evaluateResearch(s).decisions[0].metrics.flowNetPct).toBe(1)
  })
  it('gates missing products and multi-period fundamentals independently',()=>{
    const s=fixture();s.etfs[0].product.spreadBps=null;s.companies[0].financialPeriods=1
    const d=evaluateResearch(s).decisions[0];expect(d.state).toBe('watch');expect(d.heldAction).toBe('观望')
    expect(d.conditions.find(c=>c.key==='spread')).toBeUndefined();expect(d.conditions.find(c=>c.key==='fundamentals')?.status).toBe('unmet')
    expect(evaluateResearch(s).omittedConditions?.map(item=>item.key)).toContain('spread')
  })
  it('does not turn good technicals into entry when earnings or cash deteriorate',()=>{
    const s=fixture();s.companies[0].profitGrowthPct=-20;s.companies[0].cashConversionPct=10
    const d=evaluateResearch(s).decisions[0];expect(d.state).toBe('watch');expect(d.conditions.find(c=>c.key==='profit-growth')?.status).toBe('unmet')
  })
  it('retains important short news, merges duplicates and excludes future events',()=>{
    const base={id:'a',title:'公司:重大订单公告',content:'新签订单金额100亿元，预计明年分批交付，存在延期及客户验收风险。'.repeat(3),source:'公告',company:'600000',kind:'announcement' as const,publishedAt:'2026-09-01',fetchedAt:'2026-09-02'}
    const rows=clusterEvents([base,{...base,id:'b',title:'重大订单公告',content:'',source:'转载'},{...base,id:'future',publishedAt:'2026-10-01'}],'2026-09-04')
    expect(rows).toHaveLength(1);expect(rows[0].evidenceIds).toEqual(['a','b']);expect(rows[0].status).toBe('evidence')
    expect(clusterEvents([{...base,content:'上游未提供正文'}],'2026-09-04')[0].status).toBe('lead')
  })
  it('classifies governance boilerplate before broad policy or demand keywords',()=>{
    const base={id:'a',title:'公司:投资者关系管理制度（上市后适用）',content:'本制度用于规范公司治理、内部控制和投资者沟通流程。'.repeat(4),source:'公告',company:'600000',kind:'announcement' as const,publishedAt:'2026-09-01',fetchedAt:'2026-09-02'}
    expect(clusterEvents([base],'2026-09-04')[0].category).toBe('administrative')
    expect(clusterEvents([{...base,title:'公司:关于参加半年度业绩说明会的公告'}],'2026-09-04')[0].category).toBe('administrative')
  })
  it('validates bounded risk rules and requires named segments for leaders',()=>{
    const p=fixture().profile;expect(validateProfile(p,'ai')).toEqual(p)
    expect(()=>validateProfile({...p,rules:{...p.rules,flowDays:0}},'ai')).toThrow()
    expect(()=>validateProfile({...p,leaders:[{code:'NVDA',name:'Nvidia',segment:'GPU'}]},'ai')).toThrow()
  })
})
describe('P2 decisions and paper replay',()=>{
  it('is deterministic and produces traceable conditions',()=>{
    const s=fixture();expect(evaluateResearch(s)).toEqual(evaluateResearch(structuredClone(s)))
    const d=evaluateResearch(s).decisions[0];expect(d.researchOnly).toBe(true);expect(d.evidenceIds.length).toBeGreaterThan(0);expect(d.conditions.every(c=>c.status==='met')).toBe(true)
  })
  it('records condition changes even without state changes',()=>{
    const s=fixture();s.etfs[0].product.spreadBps=null;const first=evaluateResearch(s)
    s.id='second';s.etfs[0].product.nav=null;const next=evaluateResearch(s,first)
    expect(next.changes[0].changedConditions).toContain('premium');expect(next.previousSnapshotId).toBe('snapshot-one')
  })
  it('reduces risk only on verified market signals, not on missing data',()=>{
    const s=fixture();s.benchmarkBars=s.benchmarkBars.map((b,i)=>({...b,open:300-i,high:301-i,low:299-i,close:300-i}));s.etfs[0].bars=s.etfs[0].bars.map((b,i)=>({...b,open:300-i,high:301-i,low:299-i,close:300-i}));s.etfs[0].indexBars=s.etfs[0].indexBars.map((b,i)=>({...b,open:300-i,high:301-i,low:299-i,close:300-i}))
    const risk=evaluateResearch(s).decisions[0]
    expect(risk.state).toBe('risk-off');expect(risk.ruleAction?.held).toBe('减仓');expect(risk.heldAction).toBe('观望')
    s.etfs[0].factors=[];expect(evaluateResearch(s).decisions[0].heldAction).toBe('观望')
  })
  it('does not make a broad benchmark signal an industry-wide exit by itself',()=>{
    const s=fixture();s.benchmarkBars=s.benchmarkBars.map((b,i)=>({...b,open:300-i,high:301-i,low:299-i,close:300-i}))
    expect(evaluateResearch(s).decisions[0].state).toBe('watch')
  })
  it('does not backfill a validation record from a single snapshot',()=>{
    const s=fixture();expect(replayResearch([s],[evaluateResearch(s)],{commissionBps:3,slippageBps:5}).status).toBe('insufficient')
    expect(()=>replayResearch([s],[],{commissionBps:-1,slippageBps:5})).toThrow()
  })
  it('skips expired signals and never manufactures a trade',()=>{
    const s=fixture(),second=structuredClone(s);second.id='two';second.asOf='2026-09-07T09:00:00Z';second.etfs[0].bars.push({...second.etfs[0].bars.at(-1)!,date:'2026-09-07'});second.etfs[0].factors.push({date:'2026-09-07',factor:1})
    const result=replayResearch([s,second],[evaluateResearch(s),evaluateResearch(second)],{commissionBps:3,slippageBps:5})
    expect(result.results[0].trades).toHaveLength(0);expect(result.validation).toBe('not-validated')
  })
  it('fills an unexpired pre-market signal only at the subsequent open and deducts costs',()=>{
    const last=fixture(),first=structuredClone(last);last.id='last';first.id='morning';first.asOf='2026-09-04T01:05:00Z';first.capturedAt=first.asOf
    first.etfs[0].bars.pop();first.etfs[0].product.date='2026-09-03';first.etfs[0].product.bookDate='2026-09-03';first.etfs[0].product.nav=first.etfs[0].bars.at(-1)!.close
    first.sectorFlows=first.calendar.filter(d=>d.open&&d.date<='2026-09-03').slice(-5).map(d=>({date:d.date,sector:'半导体',net:10000000,netPct:1,evidenceId:'raw-one'}))
    const evaluation=evaluateResearch(first);expect(evaluation.decisions[0].state).toBe('eligible')
    const result=replayResearch([first,last],[evaluation,evaluateResearch(last)],{commissionBps:3,slippageBps:5})
    const trade=result.results[0].trades[0];expect(trade.date).toBe('2026-09-04');expect(trade.price).toBe(last.etfs[0].bars.at(-1)!.open);expect(trade.cost).toBeCloseTo(0.0008)
    expect(result.results[0].returnPct).toBeCloseTo(-0.08)
  })
})
