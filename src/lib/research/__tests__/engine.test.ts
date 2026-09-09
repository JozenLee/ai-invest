import {describe,it,expect} from 'vitest'
import {fixture} from './fixtures'
import {evaluateResearch,adjustedBars,requiredHoldingPeriod,selectProductNav} from '../engine'
import {analysisSessionBoundary,sessionBoundary,dateKey,visibleAt,nextReview} from '../time'
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
  it('uses the current open session for intraday analysis without redefining the completed close',()=>{
    const calendar=[{date:'2026-09-07',open:true},{date:'2026-09-08',open:true}]
    expect(sessionBoundary(calendar,'2026-09-08T02:00:00Z').expectedSession).toBe('2026-09-07')
    expect(analysisSessionBoundary(calendar,'2026-09-08T02:00:00Z')).toMatchObject({expectedSession:'2026-09-08',verified:true,intraday:true})
  })
  it('uses a frozen intraday bar in prices and technical decisions',()=>{
    const s=fixture(),last=s.etfs[0].bars.at(-1)!
    s.asOf='2026-09-08T02:00:00Z';s.capturedAt=s.asOf
    for(const date of ['2026-09-07','2026-09-08']){
      const prior=s.etfs[0].bars.at(-1)!,close=date==='2026-09-08'?prior.close*0.9:prior.close+1
      const bar={...prior,date,open:prior.close,high:Math.max(prior.close,close),low:Math.min(prior.close,close),close}
      s.etfs[0].bars.push(bar);s.etfs[0].factors.push({date,factor:1});s.benchmarkBars.push({...bar,close:prior.close+0.5})
      if(date==='2026-09-07')s.etfs[0].indexBars.push({...bar,close:prior.close+0.25})
    }
    s.sectorFlows.push({date:'2026-09-08',sector:'半导体',net:10000000,netPct:1,evidenceId:'raw-one'})
    const result=evaluateResearch(s),decision=result.decisions[0]
    expect(result.expectedSession).toBe('2026-09-08')
    expect(decision.metrics.date).toBe('2026-09-08')
    expect(decision.metrics.return20Pct).not.toBeNull()
    expect(decision.conditions.find(item=>item.key==='session')?.label).toBe('盘中行情对齐')
    expect(last.date).toBe('2026-09-04')
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
  it('requires the latest legally available holding period instead of a loose age window',()=>{
    expect(requiredHoldingPeriod('2026-09-04')).toBe('2026-06-30')
    const s=fixture();s.etfs[0].holdings[0].period='2026-03-31';s.etfs[0].holdings[0].publishedAt='2026-04-20'
    const holding=evaluateResearch(s).decisions[0].conditions.find(condition=>condition.key==='holdings')
    expect(holding?.status).toBe('unknown')
  })
  it('uses aligned share-size NAV only when its own close passes a sanity check',()=>{
    expect(selectProductNav({cutoff:'2026-09-04',officialDate:'2026-08-28',officialNav:1,shareDate:'2026-09-04',shareNav:1.01,shareClose:1.02})).toMatchObject({date:'2026-09-04',nav:1.01,source:'etf_share_size'})
    expect(selectProductNav({cutoff:'2026-09-04',officialDate:'2026-08-28',officialNav:1,shareDate:'2026-09-04',shareNav:1,shareClose:2})).toMatchObject({date:'2026-08-28',nav:1,source:'fund_nav'})
  })
  it('uses a bounded weighted median for look-through growth',()=>{
    const s=fixture();s.companies[0].profitGrowthPct=5000
    expect(evaluateResearch(s).decisions[0].conditions.find(condition=>condition.key==='profit-growth')?.value).toBe(300)
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
    expect(clusterEvents([{...base,title:'公司:关于实际控制人部分股票解除质押的公告'}],'2026-09-04')[0].category).toBe('administrative')
    expect(clusterEvents([{...base,title:'公司:关于回购公司股份的进展公告'}],'2026-09-04')[0].category).toBe('administrative')
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
    expect(risk.state).toBe('risk-off');expect(risk.ruleAction?.held).toBe('减仓');expect(risk.heldAction).toBe('减仓')
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
    expect(result.results[0].trades).toHaveLength(0);expect(result.validation).toBe('insufficient-history')
  })
  it('fills an unexpired pre-market signal only at the subsequent open and deducts costs',()=>{
    const last=fixture(),first=structuredClone(last);last.id='last';first.id='morning';first.asOf='2026-09-04T01:05:00Z';first.capturedAt=first.asOf
    first.etfs[0].bars.pop();first.etfs[0].product.date='2026-09-03';first.etfs[0].product.bookDate='2026-09-03';first.etfs[0].product.nav=first.etfs[0].bars.at(-1)!.close
    first.sectorFlows=first.calendar.filter(d=>d.open&&d.date<='2026-09-03').slice(-5).map(d=>({date:d.date,sector:'半导体',net:10000000,netPct:1,evidenceId:'raw-one'}))
    const evaluation=evaluateResearch(first);expect(evaluation.decisions[0].state).toBe('eligible')
    const result=replayResearch([first,last],[evaluation,evaluateResearch(last)],{commissionBps:3,slippageBps:5})
    const trade=result.results[0].trades[0];expect(trade.date).toBe('2026-09-04');expect(trade.price).toBe(last.etfs[0].bars.at(-1)!.open);expect(trade.cost).toBeCloseTo(0.0008)
    expect(result.results[0].returnPct).toBeCloseTo(-0.08)
    expect(result.results[0]).toEqual(expect.objectContaining({observations:expect.any(Number),maxDrawdownPct:expect.any(Number)}))
  })
  it('computes multi-horizon risk diagnostics without changing the rule gate',()=>{
    const result=evaluateResearch(fixture()),decision=result.decisions[0]
    expect(decision.metrics).toEqual(expect.objectContaining({return60Pct:expect.any(Number),downsideVolatilityPct:null,maxDrawdown120Pct:expect.any(Number),factorScore:expect.any(Number),factorRegime:expect.any(String)}))
    expect(decision.state).toBe('eligible')
  })
  it('exposes disclosed cross-index overlap without calling it realtime exposure',()=>{
    const snapshot=fixture(),second=structuredClone(snapshot.etfs[0])
    second.ticker='159801';second.indexCode='OTHER.CSI';second.holdings=[{...second.holdings[0],weight:30},{...second.holdings[0],code:'600001',weight:30}]
    snapshot.etfs.push(second)
    const overlap=evaluateResearch(snapshot).indexOverlaps?.[0]
    expect(overlap).toMatchObject({commonHoldings:1,weightedOverlapPct:50})
    expect(overlap?.basis).toContain('不是完整指数成分重叠')
  })
})
