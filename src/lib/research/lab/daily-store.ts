import { executionAttribution, type ExecutionMark } from './execution-attribution'
import { accountConflictBlockers } from '../strategy/account-conflicts'
import { createHash } from 'node:crypto'
import { prisma } from '@/lib/db'
import { capturePortfolioEvidence } from '@/lib/workflow/steps/fetch-portfolio-step'
import { readSnapshot } from '../store'
import { evaluateResearch } from '../engine'
import { getLab } from './store'
import { buildDailyPlan, type DailyAccount, type DailyPlan, type ExecutionFeedback } from './daily-plan'
import type { RiskBudget } from '@/lib/portfolio/decision-support'
import { portfolioFingerprint } from '@/lib/portfolio/snapshot-provenance'
import { chinaDate } from '../time'
import { listUnifiedDecisionVersions } from '../decision-ledger'

const hash=(v:unknown)=>createHash('sha256').update(JSON.stringify(v)).digest('hex')
const object=(v:unknown)=>v&&typeof v==='object'&&!Array.isArray(v)?v as Record<string,unknown>:{}

export async function dailyExecution(industryId:string,strategyId?:string){
  const [lab,decisionVersions,selection]=await Promise.all([getLab(industryId),listUnifiedDecisionVersions(industryId),prisma.rawPayload.findUnique({where:{id:`daily-selection:${industryId}`}})])
  const experiment=lab.experiment
  const latest=decisionVersions.find(row=>row.allocation)||null
  const savedStrategyId=selection?JSON.parse(selection.payload).strategyId:null
  // Current unified decisions are the default. An experiment is an explicit preview.
  const unified=!!latest?.allocation&&(!strategyId||strategyId===latest.allocation.strategy.id)
  const chosen=strategyId||savedStrategyId
  const strategy=experiment?.strategies.find(s=>s.spec.id===chosen)||experiment?.strategies[0]
  const decisionVersion=unified?latest:experiment?.decisionVersionId?decisionVersions.find(row=>row.id===experiment.decisionVersionId)||null:null
  const snapshotId=unified?latest!.snapshotId:experiment?.snapshotId
  if(!snapshotId||!unified&&!strategy)throw new Error('请先完成一份新版综合分析或运行策略实验')
  const snapshot=await readSnapshot(snapshotId)
  const captured=await capturePortfolioEvidence(snapshot.profile.name)
  const account:DailyAccount|null=captured.excluded?null:{portfolioId:captured.portfolioId,asOf:captured.sourceAsOf,totalAssets:captured.totalAssets,cashWeightPct:captured.cashWeightPct||0,holdings:captured.holdings,riskBudget:captured.riskBudget as RiskBudget}
  const records=account?await prisma.rawPayload.findMany({where:{datasetKey:'daily_execution_feedback',targetCode:account.portfolioId},orderBy:{fetchedAt:'desc'}}):[]
  const effective=new Map<string,ExecutionFeedback>()
  for(const record of records){const entry=JSON.parse(record.payload) as ExecutionFeedback;if(!effective.has(`${entry.planId}:${entry.actionId}`))effective.set(`${entry.planId}:${entry.actionId}`,entry)}
  const feedbackPlans=records.length?await prisma.rawPayload.findMany({where:{datasetKey:'daily_execution_plan',targetCode:industryId,id:{in:[...new Set([...effective.values()].map(row=>row.planId))]}}}):[]
  const marks:Record<string,ExecutionMark>={}
  if(account?.asOf)for(const holding of account.holdings){if(typeof holding.unitNav==='number'&&holding.unitNav>0)marks[holding.ticker]={price:holding.unitNav,asOf:account.asOf}}
  const scopedPlanIds=new Set(feedbackPlans.map(row=>row.id))
  const attribution=executionAttribution(feedbackPlans.map(row=>JSON.parse(row.payload) as DailyPlan),[...effective.values()].filter(row=>scopedPlanIds.has(row.planId)),marks,new Date().toISOString())
  const sourceDate=unified?latest!.allocation!.sourceDate:(strategy?.latestObservation||strategy?.latestPlan)?.sourceDate
  const evaluation=evaluateResearch(snapshot),now=new Date().toISOString()
  const externalBlockers=unified?await accountConflictBlockers(industryId,latest!.allocation!,evaluation,account,now):{}
  const plan=buildDailyPlan({externalBlockers,experiment:experiment||undefined,evaluation,account,strategyId:unified?latest!.allocation!.strategy.id:strategy!.spec.id,now,feedback:[...effective.values()],prices:Object.fromEntries(snapshot.etfs.map(etf=>[etf.ticker,etf.bars.find(bar=>bar.date===sourceDate)?.close||0])),decisionVersion,requireDecisionVersion:true,selectionConfirmed:!unified&&savedStrategyId===strategy?.spec.id})
  const id=`daily-plan:${hash({...plan,asOf:undefined,session:chinaDate(plan.asOf)})}`
  const archived=await prisma.rawPayload.upsert({where:{id},create:{id,datasetKey:'daily_execution_plan',targetCode:industryId,provider:'local-private-planner-v2',payload:JSON.stringify({...plan,id}),contentHash:hash({...plan,id})},update:{}})
  const accountInput={portfolio:account,experimentId:unified?null:lab.history[0]?.id,sourceSnapshotId:snapshot.id,strategyId:plan.strategyId,policyVersionId:plan.policyVersionId,decisionVersionId:decisionVersion?.id||null}
  await prisma.rawPayload.upsert({where:{id:`${id}:account`},create:{id:`${id}:account`,datasetKey:'daily_execution_account_input',targetCode:industryId,provider:'local-private-planner-v2',payload:JSON.stringify(accountInput),contentHash:hash(accountInput)},update:{}})
  return {attribution,plan:JSON.parse(archived.payload) as DailyPlan,accountReview:captured.excluded?null:{portfolioId:captured.portfolioId,cashBalance:captured.cashBalance,holdings:captured.holdings.map(h=>({ticker:h.ticker,name:h.name,quantity:h.quantity,unitNav:h.unitNav})),asOf:captured.sourceAsOf},
    strategies:[...(latest?.allocation?[{id:latest.allocation.strategy.id,name:'综合报告统一目标'}]:[]),...(experiment?.strategies||[]).map(s=>({id:s.spec.id,name:s.spec.name}))],selectionExpired:!unified&&!!chosen&&chosen!==strategy?.spec.id,
    selectionBasis:unified?'使用综合报告的归档目标；价格实验仅作对照，不替换该目标':savedStrategyId===strategy?.spec.id?'已选定的价格实验情景预览':'价格实验预览，与综合策略独立评价',
    decisionVersion:decisionVersion?{id:decisionVersion.id,reportId:decisionVersion.reportId,generatedAt:decisionVersion.generatedAt,validUntil:decisionVersion.validUntil,quality:decisionVersion.reportQuality}:null,
    automation:{enabled:lab.settings.enabled,lastRun:lab.daily},report:{conclusion:plan.summary,research:unified?null:strategy?.researchReport,experimentAsOf:unified?latest!.generatedAt:experiment!.asOf,
      historical:unified?{returnPct:null,maxDrawdownPct:null,observations:0}:strategy!.historical,participation:unified?null:strategy?.participation,controls:unified?null:strategy?.controls,validation:unified?'统一策略需独立积累归档决策重放与前瞻证据':strategy!.promotion.reason}}
}

export async function saveDailySelection(industryId:string,strategyId:unknown){
  if(typeof strategyId!=='string')throw new Error('请选择当前实验中的策略情景')
  const lab=await getLab(industryId)
  const decisions=await listUnifiedDecisionVersions(industryId)
  if(!decisions.some(d=>d.allocation?.strategy.id===strategyId)&&!lab.experiment?.strategies.some(s=>s.spec.id===strategyId))throw new Error('策略版本已变化，请刷新后重新选择')
  const id=`daily-selection:${industryId}`,value={strategyId,selectedAt:new Date().toISOString(),mode:'manual-trial'}
  const data={datasetKey:'daily_execution_selection',targetCode:industryId,provider:'user-selection',payload:JSON.stringify(value),contentHash:hash(value)}
  await prisma.rawPayload.upsert({where:{id},create:{id,...data},update:{...data,fetchedAt:new Date()}})
}

export function validateFeedback(value:unknown,plan:DailyPlan,now:string):ExecutionFeedback{
  const v=object(value),action=plan.actions.find(a=>a.id===v.actionId)
  if(!action||typeof v.id!=='string'||!/^[-a-zA-Z0-9]{8,100}$/.test(v.id))throw new Error('操作项或幂等标识无效')
  if(!['submitted','filled','skipped','cancelled'].includes(String(v.status)))throw new Error('请选择已提交、已确认成交或跳过')
  if(action.side==='none'&&v.status!=='skipped')throw new Error('无需交易的项目不能登记为成交，请使用对应的交易清单')
  if(typeof v.occurredAt!=='string'||!Number.isFinite(Date.parse(v.occurredAt))||Date.parse(v.occurredAt)>Date.parse(now)||Date.parse(v.occurredAt)<Math.floor(Date.parse(plan.asOf)/1000)*1000)throw new Error('操作时间必须在清单生成后且不晚于当前时间')
  if(v.status==='filled'&&(![v.quantity,v.price].every(n=>typeof n==='number'&&Number.isFinite(n)&&n>0)||typeof v.fee!=='number'||!Number.isFinite(v.fee)||v.fee<0))throw new Error('确认成交需填写实际份额、价格/净值和费用；费用可为0')
  if(typeof v.note!=='string'||v.note.length>1000||['skipped','cancelled'].includes(String(v.status))&&!v.note.trim())throw new Error('跳过需填写原因，备注最多1000字')
  return {id:v.id,planId:plan.id,actionId:action.id,ticker:action.ticker,status:v.status as ExecutionFeedback['status'],recordedAt:now,occurredAt:v.occurredAt,note:v.note, ...(v.status==='filled'?{quantity:Number(v.quantity),price:Number(v.price),fee:Number(v.fee)}:{})}
}

export async function recordDailyFeedback(industryId:string,value:unknown){
  const v=object(value)
  if(typeof v.planId!=='string')throw new Error('缺少清单标识')
  const planId=v.planId
  return prisma.$transaction(async tx=>{
  const row=await tx.rawPayload.findUnique({where:{id:planId}})
  if(!row||row.datasetKey!=='daily_execution_plan'||row.targetCode!==industryId)throw new Error('清单不属于当前领域')
  const plan=JSON.parse(row.payload) as DailyPlan
  if(!plan.portfolioId)throw new Error('没有关联账户，不能登记真实操作')
  const entry=validateFeedback(value,plan,new Date().toISOString()),id=`daily-feedback:${entry.id}`
  const existing=await tx.rawPayload.findUnique({where:{id}})
  if(existing){const old=JSON.parse(existing.payload);if(old.planId!==entry.planId||old.actionId!==entry.actionId||old.status!==entry.status||old.occurredAt!==entry.occurredAt||old.quantity!==entry.quantity||old.price!==entry.price||old.fee!==entry.fee||old.note!==entry.note)throw new Error('同一幂等标识不能用于不同操作');return old}
  const action=plan.actions.find(a=>a.id===entry.actionId)!
  const previous=await tx.rawPayload.findMany({where:{datasetKey:'daily_execution_feedback',targetCode:plan.portfolioId,payload:{contains:JSON.stringify(plan.id)}},orderBy:{fetchedAt:'desc'}})
  const prior=previous.map(r=>JSON.parse(r.payload) as ExecutionFeedback).find(r=>r.planId===entry.planId&&r.actionId===entry.actionId)
  if(prior?.status==='filled'||prior?.status==='submitted'&&!['filled','cancelled'].includes(entry.status))throw new Error('该操作已提交或确认；提交记录只能补充成交或撤销确认，不能重复提交或用跳过覆盖')
  const enriched={...entry,side:action.side,plannedAmount:action.amount,actualAmount:entry.status==='filled'?entry.quantity!*entry.price!:null,amountDeviation:entry.status==='filled'&&action.amount!==null?entry.quantity!*entry.price!-action.amount:null,wasBlocked:action.status==='blocked',scope:'用户记录，未调用交易平台，也未自动改写持仓'}
  await tx.rawPayload.create({data:{id,datasetKey:'daily_execution_feedback',targetCode:plan.portfolioId,provider:'user-recorded',payload:JSON.stringify(enriched),contentHash:hash(enriched)}})
  return enriched
  })
}

export async function confirmDailyAccount(value:unknown){
  const v=object(value),now=new Date().toISOString()
  if(v.confirmed!==true||typeof v.portfolioId!=='string'||typeof v.cashBalance!=='number'||!Number.isFinite(v.cashBalance)||v.cashBalance<0||typeof v.asOf!=='string'||!Number.isFinite(Date.parse(v.asOf))||Date.parse(v.asOf)>Date.parse(now)||!Array.isArray(v.holdings))throw new Error('请填写实际账户数据、业务时点并确认已核对')
  const holdings=v.holdings.map(object)
  if(holdings.some(h=>typeof h.ticker!=='string'||typeof h.quantity!=='number'||!Number.isFinite(h.quantity)||h.quantity<0||typeof h.unitNav!=='number'||!Number.isFinite(h.unitNav)||h.unitNav<=0)||new Set(holdings.map(h=>h.ticker)).size!==holdings.length)throw new Error('持仓代码、份额或净值无效')
  const normalized=holdings.map(h=>({ticker:String(h.ticker),quantity:Number(h.quantity),unitNav:Number(h.unitNav)}))
  const portfolioId=v.portfolioId,cashBalance=v.cashBalance,asOf=new Date(v.asOf).toISOString()
  return prisma.$transaction(async tx=>{
    const portfolio=await tx.portfolio.findUnique({where:{id:portfolioId},include:{holdings:true}})
    if(!portfolio||portfolio.holdings.length!==normalized.length||portfolio.holdings.some(h=>!normalized.some(n=>n.ticker===h.ticker)))throw new Error('持仓范围已变化，请先在持仓页增删产品，再重新核对')
    const backup={cashBalance:portfolio.cashBalance,holdings:portfolio.holdings,asOf:now}
    await tx.rawPayload.create({data:{datasetKey:'portfolio_manual_backup',targetCode:portfolioId,provider:'user-confirmed',payload:JSON.stringify(backup),contentHash:hash(backup)}})
    for(const h of normalized)await tx.holding.update({where:{portfolioId_ticker:{portfolioId,ticker:h.ticker}},data:{quantity:h.quantity,unitNav:h.unitNav}})
    await tx.portfolio.update({where:{id:portfolioId},data:{cashBalance,lastSyncedAt:new Date()}})
    const evidence={asOf,confirmedAt:now,fingerprint:portfolioFingerprint(cashBalance,normalized),source:'user-confirmed-account'}
    await tx.rawPayload.create({data:{datasetKey:'portfolio_manual_confirmation',targetCode:portfolioId,provider:'user-confirmed',payload:JSON.stringify(evidence),contentHash:hash(evidence)}})
    return {asOf}
  })
}
