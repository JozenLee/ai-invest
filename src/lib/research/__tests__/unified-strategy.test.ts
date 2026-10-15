import { describe,it,expect,vi } from 'vitest'
vi.mock('@/lib/db',()=>({prisma:{}}))
import { fixture } from './fixtures'
import { evaluateResearch } from '../engine'
import { createPolicy,decideAllocation,type AllocationInput } from '../strategy/kernel'
import { auditTemporalEvidence } from '../strategy/temporal'
import { compareUnifiedStrategies,defaultProtocol } from '../strategy/validation'
import {simulatePortfolio} from '../lab/simulator'
import {STRATEGIES} from '../lab/contracts'
import { datasetFromSnapshot } from '../lab/experiment'
import { buildUnifiedDecisionVersion,assessDecisionHistory } from '../decision-ledger'
import { buildDailyPlan,type DailyAccount } from '../lab/daily-plan'
import { unifiedPortfolioSupport } from '../strategy/portfolio'
import { buildPortfolioDecisionSupport } from '@/lib/portfolio/decision-support'

export function allocationFixture(index=80):AllocationInput{
  const snapshot=fixture(),date=snapshot.etfs[0].bars[index].date
  return {snapshotId:`snapshot-${index}`,asOf:`${date}T15:30:00+08:00`,generatedAt:`${date}T16:00:00+08:00`,sourceDate:date,policy:createPolicy(),evidence:[{id:'proof',businessAt:date,publishedAt:`${date}T15:00:00+08:00`,observedAt:`${date}T15:10:00+08:00`,hash:'immutable'}],products:[{ticker:'159995',indexCode:'980017.SZ',direction:'increase',adjustmentPct:10,verified:true,validUntil:`${snapshot.etfs[0].bars[index+1].date}T15:00:00+08:00`,reason:'景气改善',trigger:'趋势确认',invalidation:'趋势失效',evidenceIds:['proof'],opinionId:`opinion-${index}`}]}
}
function advice(input:AllocationInput){return {rating:'积极',productDecisions:input.products.map(p=>({ticker:p.ticker,heldAction:p.direction==='reduce'?'减仓':'加仓',unheldAction:p.direction==='increase'?'建仓':'观望',suggestedAdjustmentPct:p.adjustmentPct,confidencePct:70,reason:p.reason,trigger:p.trigger,invalidation:p.invalidation,evidenceIds:p.evidenceIds,quantitativeOverride:null,decisionSource:'ai',executionContract:{asOf:input.asOf,validUntil:p.validUntil,status:'verified',triggerRules:[],reviewPolicy:'daily'}}))}}
function version(input:AllocationInput){const evaluation=evaluateResearch(fixture());evaluation.snapshotId=input.snapshotId;return buildUnifiedDecisionVersion({reportId:`report-${input.snapshotId}`,runId:input.snapshotId,industryId:'ai',snapshotId:input.snapshotId,generatedAt:input.generatedAt,horizonTradingDays:20,evaluation,investmentAdvice:advice(input),allocation:decideAllocation(input),reportQuality:{usability:'advice-grade',executionReadinessScore:100}})}

describe('P0–P2 unified decision closure',()=>{
  it('does not repeatedly increase exposure when the same AI opinion is reviewed',()=>{
    const first=allocationFixture(),original=decideAllocation(first),review=allocationFixture(81)
    review.previous=original;review.products[0].opinionId=first.products[0].opinionId
    expect(decideAllocation(review).targets).toEqual(original.targets)
    review.products[0].opinionId='new-opinion'
    expect(decideAllocation(review).targets['159995']).toBe(.2)
  })
  it('holds missing and expired inputs as blocked instead of fabricating zero targets',()=>{
    const original=decideAllocation(allocationFixture()),next=allocationFixture(81);next.previous=original;next.products[0].verified=false;next.products[0].direction='reduce'
    expect(decideAllocation(next)).toMatchObject({status:'blocked',targets:{'159995':.1}})
    next.products[0].verified=true;next.products[0].validUntil='invalid'
    expect(decideAllocation(next).status).toBe('blocked')
    next.products=[];expect(decideAllocation(next).targets).toEqual(original.targets)
  })
  it('checks recorded fundamental and market features without backfilling current facts',()=>{
    const input=allocationFixture();input.policy=createPolicy({filters:{minRelative20Pct:1,maxVolatilityPct:30,requirePositiveProfit:true}})
    expect(decideAllocation(input).status).toBe('blocked')
    input.products[0].features={relative20Pct:2,volatilityPct:20,profitGrowthPct:10}
    expect(decideAllocation(input).targets['159995']).toBe(.1)
    input.products[0].features.profitGrowthPct=-1
    expect(decideAllocation(input).targets['159995']).toBe(0)
    input.products[0].direction='reduce';input.previous=decideAllocation({...allocationFixture(79)})
    expect(decideAllocation(input).targets['159995']).toBe(0)
  })
  it('limits duplicate index exposure and never uses unknown holdings to fund a buy',()=>{
    const input=allocationFixture();input.policy=createPolicy({maxExposure:.3,maxWeight:.3,maxTurnover:1,minCash:.7})
    input.products[0].adjustmentPct=30
    input.products.push({...input.products[0],ticker:'159996'})
    const result=decideAllocation(input)
    expect(Object.values(result.targets).reduce((sum,w)=>sum+w,0)).toBe(.3)
    const next=allocationFixture(81);next.previous=result;next.policy=input.policy;next.products[0].verified=false;next.products[0].direction='reduce'
    next.products.push({...input.products[0],ticker:'other',indexCode:'other'})
    const blocked=decideAllocation(next)
    expect(blocked.targets['159995']).toBe(result.targets['159995'])
    expect(Object.values(blocked.targets).reduce((sum,w)=>sum+w,0)).toBeLessThanOrEqual(.3)
  })
  it('rejects future observations even when the financial business period is old',()=>{
    const input=allocationFixture();input.evidence![0].businessAt='2020-01-01';input.evidence![0].observedAt='2030-01-01'
    expect(auditTemporalEvidence(input.evidence!,['proof'],input.asOf).status).toBe('blocked')
    expect(auditTemporalEvidence([{...input.evidence![0],publishedAt:null}],['proof'],input.asOf,'public-history').status).toBe('blocked')
  })
  it('reproduces full portfolio targets and compares a candidate on identical price/cost boundaries',()=>{
    const data=datasetFromSnapshot(fixture()),one=allocationFixture(),two=allocationFixture(100);two.previous=decideAllocation(one);two.products[0].direction='reduce'
    const archives=[one,two].map(input=>({decisionId:input.snapshotId,availableAt:input.generatedAt,input,allocation:decideAllocation(input)}))
    const protocol=defaultProtocol(data),same=compareUnifiedStrategies(data,archives,one.policy,protocol)
    expect(same.exactReplayVerified).toBe(true)
    expect(same.baseline.equity).toEqual(same.challenger.equity)
    expect(same.incrementalReturnPct).toBe(0)
    expect(same.baseline.fills[0].date).toBe(fixture().etfs[0].bars[81].date)
    expect(same.baseline.costs).toBeGreaterThan(0)
    const half=compareUnifiedStrategies(data,archives,createPolicy({adjustmentScale:.5}),protocol)
    expect(half.challenger.fills[0].notional).toBeLessThan(half.baseline.fills[0].notional)
    expect(half.holdout?.status).toBe('diagnostic-already-viewed')
  })
  it('does not simulate orders from reports that failed the execution gate',()=>{
    const input=allocationFixture(),data=datasetFromSnapshot(fixture())
    const result=compareUnifiedStrategies(data,[{decisionId:'blocked',availableAt:input.generatedAt,executionReady:false,input,allocation:decideAllocation(input)}],input.policy,defaultProtocol(data))
    expect(result.baseline.trades).toBe(0);expect(result.challenger.trades).toBe(0)
    expect(result.nonExecutable).toEqual(['blocked'])
  })
  it('enforces lots, minimum fees, settlement and unavailable execution metadata',()=>{
    const data=datasetFromSnapshot(fixture()),asset=data.assets[0],sourceDate=asset.bars[80].date,next=asset.bars[81].date
    const plan={id:'strict',strategyId:'strict',sourceDate,generatedAt:`${sourceDate}T16:00:00+08:00`,validUntil:`${next}T15:00:00+08:00`,targets:{'159995':.3},features:[],reason:'test'}
    const spec={...STRATEGIES[0],id:'strict',drawdownBudget:1}
    const options={mode:'forward-paper' as const,plans:[plan],executionMode:'exchange' as const}
    expect(simulatePortfolio(data,spec,options).trades).toBe(0)
    asset.rawBars=asset.bars
    asset.execution={lotSize:100,minimumCommission:5,maxParticipation:.1,settlementSessions:2,sessions:Object.fromEntries(asset.bars.map(bar=>[bar.date,{canBuy:true,canSell:true,source:'fixture-open-status',availableAt:`${bar.date}T09:30:00+08:00`}]))}
    const fill=simulatePortfolio(data,spec,options).fills[0]
    expect(fill.executionUnits!%100).toBe(0);expect(fill.cost).toBeGreaterThanOrEqual(5)
    const sellDate=asset.bars[82].date
    const sell={...plan,id:'sell',sourceDate:next,generatedAt:`${next}T16:00:00+08:00`,validUntil:`${sellDate}T15:00:00+08:00`,targets:{'159995':0}}
    expect(simulatePortfolio(data,spec,{...options,plans:[plan,sell]}).fills).toHaveLength(1)
    asset.execution.sessions[next].canBuy=false
    expect(simulatePortfolio(data,spec,options).trades).toBe(0)
    asset.execution.sessions[next].canBuy=true;asset.execution.sessions[next].availableAt='2099-01-01'
    expect(simulatePortfolio(data,spec,options).trades).toBe(0)
  })
  it('excludes tampered targets and future evidence from a historical comparison',()=>{
    const input=allocationFixture(),allocation=decideAllocation(input);allocation.targets['159995']=.9
    const result=compareUnifiedStrategies(datasetFromSnapshot(fixture()),[{decisionId:'d',availableAt:input.generatedAt,input,allocation}],input.policy,defaultProtocol(datasetFromSnapshot(fixture())))
    expect(result.accepted).toBe(0);expect(result.exclusions[0].reason).toContain('不能精确复现')
  })
  it('shares report/account plans and closes submission → fill → refreshed account without a duplicate order',()=>{
    const input=allocationFixture(),decision=version(input),evaluation=evaluateResearch(fixture());evaluation.snapshotId=input.snapshotId
    const account:DailyAccount={portfolioId:'test',asOf:input.generatedAt,totalAssets:100000,cashWeightPct:100,holdings:[],riskBudget:{riskProfile:'moderate',investHorizon:'medium',minCashRatio:.2,maxIndustryRatio:.6,maxFundRatio:.3,maxSingleAdjustmentRatio:.1,stagedAdjustment:false}}
    const common={evaluation,account,decisionVersion:decision,now:input.generatedAt,prices:{'159995':10}}
    const daily=buildDailyPlan(common)
    const base=buildPortfolioDecisionSupport({evaluation,holdings:[],totalAssets:account.totalAssets,cashWeightPct:100,policy:account.riskBudget,dataQualityAvailable:true,investmentAdvice:advice(input)})
    const report=unifiedPortfolioSupport({base,decision,evaluation,account,now:input.generatedAt,prices:common.prices})
    expect(daily.actions[0]).toMatchObject({amount:10000,targetWeightPct:10,status:'review'})
    expect(report.actions[0].amount).toBe(daily.actions[0].amount)
    const receipt={id:'receipt-123',planId:'p',actionId:'159995',ticker:'159995',status:'submitted' as const,recordedAt:input.generatedAt,occurredAt:input.generatedAt,note:''}
    expect(buildDailyPlan({...common,feedback:[receipt]}).actions[0].status).toBe('blocked')
    account.cashWeightPct=90;account.holdings=[{ticker:'159995',name:'ETF',quantity:1000,unitNav:10,marketValue:10000,weightPct:10}]
    expect(buildDailyPlan({...common,feedback:[{...receipt,status:'filled',quantity:1000,price:10,fee:0}]}).actions[0].side).toBe('none')
  })
  it('deduplicates report revisions and excludes overlapping same-index windows from direction statistics',()=>{
    const first=version(allocationFixture()),second=version(allocationFixture(81))
    const revision={...first,id:'revision',generatedAt:first.generatedAt.replace('16:00','16:10')}
    const assessment=assessDecisionHistory([first,revision,second],fixture())
    expect(assessment.excludedDuplicates).toBe(1);expect(assessment.excludedOverlaps).toBe(1)
    expect(assessment.directionalMatured).toBe(1);expect(assessment.calibrationStatus).not.toBe('calibrated')
  })
})

it('never turns initial or repeatedly reviewed research cash into a hold-opinion liquidation',()=>{
  const input=allocationFixture(),decision=version(input),evaluation=evaluateResearch(fixture())
  evaluation.snapshotId=input.snapshotId
  decision.products=decision.products.map(p=>({...p,direction:'neutral',heldAction:'持有',unheldAction:'观望',suggestedAdjustmentPct:0}))
  decision.allocation!.targets={'159995':0};decision.allocation!.priorTargets={'159995':0}
  const account:DailyAccount={portfolioId:'test',asOf:input.generatedAt,totalAssets:100000,cashWeightPct:80,holdings:[{ticker:'159995',name:'ETF',quantity:2000,unitNav:10,marketValue:20000,weightPct:20}],riskBudget:{riskProfile:'moderate',investHorizon:'medium',minCashRatio:.2,maxIndustryRatio:.6,maxFundRatio:.3,maxSingleAdjustmentRatio:.1,stagedAdjustment:false}}
  for(const initialState of ['cash','previous-targets'] as const){
    decision.allocation!.initialState=initialState
    const plan=buildDailyPlan({evaluation,account,decisionVersion:decision,now:input.generatedAt,prices:{'159995':10}})
    expect(plan.actions[0].status).toBe('blocked')
    expect(plan.actions[0].blockers.join('')).toContain('不代表已有持仓的退出指令')
  }
})
