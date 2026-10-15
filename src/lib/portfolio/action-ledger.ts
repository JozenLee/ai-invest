import { createHash } from 'node:crypto'
import type { PortfolioAction, RiskBudget } from './decision-support'

export type PortfolioActionCandidate = {
  portfolioId: string
  runId: string
  industry: string
  asOf: string
  confidencePct: number
  totalAssets: number
  cashWeightPct: number
  action: PortfolioAction
}

export type PortfolioActionLedger = {
  version: 1
  portfolioId: string
  asOf: string
  actions: PortfolioAction[]
  conflicts: Array<{ticker:string;industries:string[];detail:string}>
  sourceRunIds: string[]
  basis: string
}

const directional=(action:PortfolioAction)=>action.action==='加仓'?1:action.action==='减仓'?-1:0
const round=(value:number,digits=2)=>Number(value.toFixed(digits))

export function reconcilePortfolioActionCandidates(candidates:PortfolioActionCandidate[],policy:RiskBudget,now=new Date()):PortfolioActionLedger{
  const valid=candidates.filter(item=>item.portfolioId&&Number.isFinite(Date.parse(item.asOf))&&now.getTime()-Date.parse(item.asOf)<=7*86400000)
  const latest=new Map<string,PortfolioActionCandidate>()
  for(const item of valid){
    const key=`${item.action.ticker}:${item.industry}`
    const previous=latest.get(key)
    if(!previous||Date.parse(item.asOf)>Date.parse(previous.asOf))latest.set(key,item)
  }
  const grouped=new Map<string,PortfolioActionCandidate[]>()
  for(const item of latest.values())grouped.set(item.action.ticker,[...(grouped.get(item.action.ticker)||[]),item])
  const conflicts:PortfolioActionLedger['conflicts']=[],selected:PortfolioActionCandidate[]=[]
  const actions:PortfolioAction[]=[]
  for(const [ticker,rows] of grouped){
    const directions=new Set(rows.map(row=>directional(row.action)).filter(Boolean))
    if(directions.size>1){
      const base=rows.sort((a,b)=>Date.parse(b.asOf)-Date.parse(a.asOf))[0]
      const industries=[...new Set(rows.map(row=>row.industry))]
      conflicts.push({ticker,industries,detail:'不同产业研究对同一基金给出相反方向，组合层降级为观望，不输出交易金额'})
      actions.push({...base.action,action:'观望',targetWeightPct:base.action.currentWeightPct,changeWeightPct:0,amount:null,estimatedUnits:null,estimatedFee:null,executable:false,reason:`跨产业动作冲突：${industries.join('、')}；等待下一轮统一组合研究。`,constraintNotes:[...new Set([...(base.action.constraintNotes||[]),'跨产业动作冲突已由组合台账阻断'])]})
      continue
    }
    const actionable=rows.filter(row=>directional(row.action)!==0&&row.action.changeWeightPct!==null)
    const chosen=(actionable.length?actionable:rows).sort((a,b)=>b.confidencePct-a.confidencePct||Date.parse(b.asOf)-Date.parse(a.asOf))[0]
    selected.push(chosen)
  }
  let capacity=policy.maxSingleAdjustmentRatio*100
  const ordered=selected.sort((a,b)=>directional(a.action)-directional(b.action)||b.confidencePct-a.confidencePct)
  let cashRoom=Math.max(0,(ordered[0]?.cashWeightPct||0)-policy.minCashRatio*100)
  for(const item of ordered){
    const action=item.action,dir=directional(action),requested=Math.abs(action.changeWeightPct||0)
    if(!dir||requested<=.005){actions.push(action);continue}
    const allowed=dir<0?Math.min(requested,capacity):Math.min(requested,capacity,cashRoom)
    if(allowed<=.005){
      actions.push({...action,action:'观望',targetWeightPct:action.currentWeightPct,changeWeightPct:0,amount:null,estimatedUnits:null,estimatedFee:null,executable:false,reason:`${action.reason}；组合级每日调整上限或现金底仓已无剩余空间。`})
      continue
    }
    const ratio=requested>0?allowed/requested:0,change=round(dir*allowed)
    const amount=round(allowed/100*item.totalAssets)
    capacity-=allowed
    cashRoom=dir<0?cashRoom+allowed:cashRoom-allowed
    actions.push({...action,targetWeightPct:round(action.currentWeightPct+change),changeWeightPct:change,amount,estimatedUnits:action.estimatedUnits===null?null:round(action.estimatedUnits*ratio,2),estimatedFee:action.estimatedFee===null?null:round(action.estimatedFee*ratio),batches:policy.stagedAdjustment&&amount>0?Math.min(3,Math.max(2,Math.ceil(allowed/2))):1,constraintNotes:allowed+.005<requested?[...new Set([...(action.constraintNotes||[]),'组合级动作台账再次裁剪每日总调整额度'])]:action.constraintNotes})
  }
  const first=valid[0]
  return {version:1,portfolioId:first?.portfolioId||'',asOf:now.toISOString(),actions:actions.sort((a,b)=>a.ticker.localeCompare(b.ticker)),conflicts,sourceRunIds:[...new Set(valid.map(item=>item.runId))],basis:'每个基金每个产业只保留最新候选；相反方向降级为观望；同方向取最高置信候选，不跨产业累加；全组合重新应用每日调整上限与现金底仓。'}
}

export async function persistAndReconcilePortfolioActions(input:{
  portfolioId:string;runId:string;industry:string;asOf:string;confidencePct:number;totalAssets:number;cashWeightPct:number;policy:RiskBudget;actions:PortfolioAction[]
}){
  const {prisma}=await import('@/lib/db')
  const candidates=input.actions.map(action=>({portfolioId:input.portfolioId,runId:input.runId,industry:input.industry,asOf:input.asOf,confidencePct:action.aiDecision?.confidencePct??input.confidencePct,totalAssets:input.totalAssets,cashWeightPct:input.cashWeightPct,action}))
  const payload=JSON.stringify({version:1,candidates})
  if(candidates.length)await prisma.rawPayload.create({data:{datasetKey:'portfolio_action_candidate',targetCode:input.portfolioId,provider:'portfolio-decision',payload,contentHash:createHash('sha256').update(payload).digest('hex')}})
  const rows=await prisma.rawPayload.findMany({where:{datasetKey:'portfolio_action_candidate',targetCode:input.portfolioId,fetchedAt:{gte:new Date(Date.parse(input.asOf)-7*86400000)}},orderBy:{fetchedAt:'desc'},take:200})
  const all=rows.flatMap(row=>{try{const value=JSON.parse(row.payload);return Array.isArray(value.candidates)?value.candidates as PortfolioActionCandidate[]:[]}catch{return []}})
  const ledger=reconcilePortfolioActionCandidates(all,input.policy,new Date(input.asOf))
  const serialized=JSON.stringify(ledger)
  await prisma.rawPayload.create({data:{datasetKey:'portfolio_action_ledger',targetCode:input.portfolioId,provider:'portfolio-decision',payload:serialized,contentHash:createHash('sha256').update(serialized).digest('hex')}})
  return ledger
}
