import {describe,it,expect} from 'vitest'
import {fixture} from './fixtures'
import {evaluateResearch} from '../engine'
import {datasetFromSnapshot,runExperiment} from '../lab/experiment'
import {STRATEGIES,EXPERIMENT_STRATEGIES} from '../lab/contracts'
import {targetPlan} from '../lab/modules'
import {buildDailyPlan,type DailyAccount,type ExecutionFeedback} from '../lab/daily-plan'
import {portfolioFingerprint,confirmedPortfolioDate} from '@/lib/portfolio/snapshot-provenance'
import {actionAvailability} from '@/lib/analysis/action-availability'
import type {AIProductDecision} from '@/lib/analysis/investment-conclusion'

function setup(){
  const snapshot=fixture(),data=datasetFromSnapshot(snapshot),evaluation=evaluateResearch(snapshot)
  const plan=targetPlan(data,STRATEGIES[0],'2026-09-04','2026-09-04T10:00:00Z','2026-09-07T07:00:00Z')
  plan.targets={'159995':.3}
  const experiment={...runExperiment(data,[plan]),dataStatus:'current' as const}
  const account:DailyAccount={portfolioId:'account',asOf:'2026-09-04T10:00:00Z',totalAssets:100000,cashWeightPct:80,holdings:[{ticker:'159995',name:'ETF',weightPct:20,marketValue:20000,quantity:2000,unitNav:10}],riskBudget:{riskProfile:'aggressive',investHorizon:'medium',minCashRatio:.1,maxIndustryRatio:.6,maxFundRatio:.5,maxSingleAdjustmentRatio:.05,stagedAdjustment:true}}
  return {experiment,evaluation,account,strategyId:STRATEGIES[0].id,now:'2026-09-04T11:00:00Z',prices:{'159995':10}}
}
describe('daily executable intent and evidence boundary',()=>{
  it('pre-registers exactly three entry families by three budgets',()=>{
    expect(EXPERIMENT_STRATEGIES).toHaveLength(9)
    expect(new Set(EXPERIMENT_STRATEGIES.map(s=>s.id)).size).toBe(9)
  })
  it('allows graded and probe participation before the long trend confirms, without changing confirmed logic',()=>{
    const s=fixture(),data=datasetFromSnapshot(s)
    const tail=data.assets[0].bars.slice(-61)
    for(let i=0;i<tail.length;i++){const close=i<50?100-i*.4:81+(i-50)*.4;Object.assign(tail[i],{open:close,close,high:close+1,low:close-1})}
    data.benchmarkBars=data.benchmarkBars.map((b,i)=>({...b,close:200-i*.6}))
    const totals=EXPERIMENT_STRATEGIES.filter(x=>x.drawdownBudget===.2).map(spec=>Object.values(targetPlan(data,spec,tail.at(-1)!.date,data.asOf,'2026-09-07T15:00:00+08:00').targets).reduce((s,w)=>s+w,0))
    expect(totals[0]).toBe(0);expect(totals[1]).toBeGreaterThan(totals[2]);expect(totals[2]).toBeGreaterThan(0)
  })
  it('uses saved account caps rather than importing the experimental risk budget',()=>{
    const input=setup(),plan=buildDailyPlan(input),action=plan.actions[0]
    expect(action.status).toBe('review');expect(action.changeWeightPct).toBe(5);expect(action.amount).toBe(5000)
    expect(action.targetWeightPct).toBe(25)
  })
  it('does not display hold or trade amounts for a stale account',()=>{
    const input=setup();input.account.asOf='2026-08-01T10:00:00Z'
    const action=buildDailyPlan(input).actions[0]
    expect(action.label).toBe('暂无有效动作');expect(action.amount).toBeNull()
  })
  it('subtracts same-day confirmed turnover even after account data have been refreshed',()=>{
    const input=setup();const feedback:ExecutionFeedback={id:'filled',planId:'old',actionId:'A',ticker:'A',status:'filled',occurredAt:'2026-09-04T09:00:00Z',recordedAt:'2026-09-04T09:00:00Z',quantity:600,price:10,fee:0,note:''}
    const action=buildDailyPlan({...input,feedback:[feedback]}).actions[0]
    expect(action.amount).toBe(0);expect(action.status).toBe('no-change')
  })
  it('distinguishes an explicit zero target from missing strategy data',()=>{
    const input=setup();input.experiment.strategies[0].latestObservation!.targets={'159995':0}
    expect(buildDailyPlan(input).actions[0]).toMatchObject({side:'sell',status:'review',changeWeightPct:-5})
    input.experiment.strategies[0].latestObservation!.targets={}
    expect(buildDailyPlan(input).actions[0]).toMatchObject({side:'none',status:'blocked',targetWeightPct:null,amount:null})
  })
  it('does not duplicate exposure across two feeder products tracking the same index',()=>{
    const input=setup();input.account.holdings=['A','B'].map(ticker=>({ticker,name:ticker,weightPct:10,marketValue:10000,unitNav:1,targetIndexCode:'980017.SZ',mappingSource:'official-document',mappingConfidence:1,fundType:'feeder'}))
    input.account.riskBudget.maxSingleAdjustmentRatio=1
    const plan=buildDailyPlan(input)
    expect(plan.actions).toHaveLength(2)
    expect(plan.actions.reduce((s,a)=>s+(a.targetWeightPct||0),0)).toBe(30)
  })
  it('does not clear a pending submission just because an account snapshot is newer',()=>{
    const input=setup();const feedback:ExecutionFeedback={id:'feedback1',planId:'old',actionId:'159995',ticker:'159995',status:'submitted',occurredAt:'2026-09-03T10:00:00Z',recordedAt:'2026-09-03T10:00:00Z',note:''}
    expect(buildDailyPlan({...input,feedback:[feedback]}).actions[0].amount).toBeNull()
    expect(buildDailyPlan({...input,feedback:[{...feedback,status:'filled'}]}).actions[0].status).toBe('review')
  })
  it('closes the proposal → submission → fill → refreshed-account loop without a second same-day order',()=>{
    const input=setup(),proposal=buildDailyPlan(input)
    expect(proposal.actions[0].amount).toBe(5000)
    const submitted:ExecutionFeedback={id:'receipt',planId:'first',actionId:'159995',ticker:'159995',status:'submitted',occurredAt:'2026-09-04T11:05:00Z',recordedAt:'2026-09-04T11:05:00Z',note:''}
    expect(buildDailyPlan({...input,now:'2026-09-04T11:10:00Z',feedback:[submitted]}).actions[0].status).toBe('blocked')
    const filled={...submitted,status:'filled' as const,quantity:500,price:10,fee:5}
    input.account.asOf='2026-09-04T12:00:00Z';input.account.totalAssets=99995;input.account.cashWeightPct=74995/99995*100
    input.account.holdings[0]={...input.account.holdings[0],quantity:2500,marketValue:25000,weightPct:25000/99995*100}
    const next=buildDailyPlan({...input,now:'2026-09-04T12:10:00Z',feedback:[filled]})
    expect(next.actions[0].status).toBe('no-change');expect(next.actions[0].amount).toBe(0)
  })
  it('invalidates manual confirmation when quantities, valuation or cash change',()=>{
    const holdings=[{ticker:'A',quantity:100,unitNav:1}],asOf='2026-09-04T10:00:00Z'
    const confirmation={asOf,fingerprint:portfolioFingerprint(1000,holdings)}
    expect(confirmedPortfolioDate(confirmation,1000,holdings,'2026-09-04T11:00:00Z')).toBe(asOf)
    expect(confirmedPortfolioDate(confirmation,900,holdings)).toBeNull()
    expect(confirmedPortfolioDate(confirmation,1000,[{ticker:'A',quantity:101,unitNav:1}])).toBeNull()
  })
  it('shows expired or blocked AI hold decisions as unavailable rather than instructions to hold',()=>{
    const decision:AIProductDecision={ticker:'159995',heldAction:'持有',unheldAction:'观望',suggestedAdjustmentPct:0,confidencePct:70,reason:'测试',trigger:'测试',invalidation:'测试',quantitativeOverride:null,evidenceIds:[],decisionSource:'ai',executionContract:{asOf:'2026-09-04T08:00:00Z',validUntil:'2026-09-05T08:00:00Z',status:'verified',triggerRules:[],reviewPolicy:'daily'}}
    expect(actionAvailability(decision,true,Date.parse('2026-09-06')).held).toBe('暂无有效建议')
    expect(actionAvailability(decision,true,Date.parse('2026-09-04T09:00:00Z')).held).toBe('持有')
    decision.executionContract!.status='blocked'
    expect(actionAvailability(decision,true,Date.parse('2026-09-04T09:00:00Z')).held).toBe('暂无有效建议')
  })
  it('requires one current advice-grade decision version before a strategy target becomes actionable',()=>{
    const input=setup(),evaluation=input.evaluation
    const decisionVersion={version:1 as const,id:'decision-version:one',industryId:'ai',reportId:'report',runId:'run',snapshotId:input.experiment.snapshotId,generatedAt:'2026-09-04T10:00:00Z',horizonTradingDays:20,validUntil:'2026-09-05T08:00:00Z',source:'comprehensive-report' as const,
      reportQuality:{overallScore:80,usability:'limited-advice',validationStatus:'insufficient-history',executionReadinessScore:0},products:[{ticker:'159995',name:'ETF',indexCode:evaluation.decisions[0].indexCode,direction:'increase' as const,unheldAction:'建仓' as const,heldAction:'加仓' as const,suggestedAdjustmentPct:5,confidencePct:70,quantitativeState:'eligible',reason:'测试',trigger:'测试',invalidation:'测试',evidenceIds:['raw-one'],executionStatus:'verified' as const,validUntil:'2026-09-05T08:00:00Z'}]}
    let plan=buildDailyPlan({...input,decisionVersion,requireDecisionVersion:true,selectionConfirmed:true})
    expect(plan.actions[0]).toMatchObject({status:'blocked',amount:null})
    decisionVersion.reportQuality={...decisionVersion.reportQuality,usability:'advice-grade',executionReadinessScore:100}
    plan=buildDailyPlan({...input,decisionVersion,requireDecisionVersion:true,selectionConfirmed:true})
    expect(plan.actions[0]).toMatchObject({status:'review',amount:5000})
  })
})
