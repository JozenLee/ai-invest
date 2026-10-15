import { describe,expect,it } from 'vitest'
import { reconcilePortfolioActionCandidates,type PortfolioActionCandidate } from '../action-ledger'
import type { PortfolioAction,RiskBudget } from '../decision-support'

const policy:RiskBudget={riskProfile:'moderate',investHorizon:'medium',minCashRatio:.1,maxIndustryRatio:.3,maxFundRatio:.2,maxSingleAdjustmentRatio:.05,stagedAdjustment:true}
const action=(ticker:string,direction:'加仓'|'减仓',change:number):PortfolioAction=>({ticker,name:ticker,action:direction,currentWeightPct:10,targetWeightPct:10+change,changeWeightPct:change,amount:Math.abs(change)*1000,estimatedUnits:100,estimatedFee:10,batches:1,executable:true,reason:'r',trigger:'t',invalidation:'i',mapping:{ticker,fundType:'active',targetEtfCode:null,targetIndexCode:null,decisionTicker:null,method:'research-fund',confidence:.9,verified:true,domainVerified:true,scope:'fund'},gaps:[]})
const candidate=(industry:string,a:PortfolioAction,confidencePct=80):PortfolioActionCandidate=>({portfolioId:'p',runId:industry,industry,asOf:'2026-09-18T00:00:00Z',confidencePct,totalAssets:100000,cashWeightPct:20,action:a})

describe('portfolio action ledger',()=>{
  it('blocks conflicting industry directions for one real fund',()=>{
    const result=reconcilePortfolioActionCandidates([candidate('机器人',action('f','加仓',3)),candidate('AI硬件',action('f','减仓',-2))],policy,new Date('2026-09-18T01:00:00Z'))
    expect(result.actions[0]).toMatchObject({ticker:'f',action:'观望',amount:null,executable:false})
    expect(result.conflicts).toHaveLength(1)
  })
  it('does not add same-direction industry requests and reapplies the global daily cap',()=>{
    const result=reconcilePortfolioActionCandidates([candidate('机器人',action('f','加仓',4),90),candidate('AI硬件',action('f','加仓',3),70),candidate('创新药',action('g','加仓',4),80)],policy,new Date('2026-09-18T01:00:00Z'))
    expect(result.actions.find(item=>item.ticker==='f')?.changeWeightPct).toBe(4)
    expect(result.actions.reduce((sum,item)=>sum+Math.abs(item.changeWeightPct||0),0)).toBe(5)
  })
})

