import { readVerifiedArchive } from '../archive-json'
import { researchLoopMetrics } from '../loop-metrics'
import { latestAutoReanalysis } from '../auto-reanalysis'
import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { prisma } from '@/lib/db'
import { readSnapshot } from '../store'
import { withResearchLease } from '../lease'
import { chinaDate, sessionBoundary } from '../time'
import { LAB_VERSION, STRATEGIES, EXPERIMENT_STRATEGIES, ENTRY_FAMILIES, type TargetPlan } from './contracts'
import { datasetFromSnapshot, runExperiment, type LabExperiment } from './experiment'
import { targetPlan } from './modules'
import { extendDataset } from './history'
import type { LabDataset } from './contracts'
import { evaluateResearch } from '../engine'
import { attachFrozenModules } from './frozen-modules'
import { proposeChallengers } from './evolution'
import { labRunDue } from './schedule'
import { archiveDecisionHistory, assessDecisionHistory, listUnifiedDecisionVersions } from '../decision-ledger'

const hash=(value:unknown)=>createHash('sha256').update(JSON.stringify(value)).digest('hex')
export type LabSettings={enabled:boolean;style:'aggressive';riskBudgetMode:'compare';accountDrawdownBudget:null}
export const LAB_DEFAULTS:LabSettings={enabled:false,style:'aggressive',riskBudgetMode:'compare',accountDrawdownBudget:null}
const inFlight=new Map<string,Promise<LabExperiment>>()

export async function labSettings(industryId:string):Promise<LabSettings>{
  const row=await prisma.rawPayload.findUnique({where:{id:`strategy-lab-settings:${industryId}`}})
  return row?{...LAB_DEFAULTS,...JSON.parse(row.payload)}:LAB_DEFAULTS
}
export async function setLabEnabled(industryId:string,enabled:boolean){
  const value={...LAB_DEFAULTS,enabled},data={datasetKey:'strategy_lab_settings',targetCode:industryId,provider:'local-research',payload:JSON.stringify(value),contentHash:hash(value)}
  await prisma.rawPayload.upsert({where:{id:`strategy-lab-settings:${industryId}`},create:{id:`strategy-lab-settings:${industryId}`,...data},update:{...data,fetchedAt:new Date()}})
  return value
}

async function immutable(id:string,key:string,industryId:string,value:unknown){
  const payload=JSON.stringify(value),contentHash=hash(value)
  // Conflict never updates historical inputs or plans.
  await prisma.rawPayload.upsert({where:{id},create:{id,datasetKey:key,targetCode:industryId,provider:`strategy-lab/${LAB_VERSION}`,payload,contentHash},update:{}})
}
async function engineHash(){
  const files=['contracts.ts','modules.ts','simulator.ts','experiment.ts','outcomes.ts','history.ts','frozen-modules.ts','evolution.ts','metrics.ts','rolling-validation.ts','../strategy/kernel.ts']
  return hash(await Promise.all(files.map(file=>readFile(path.join(process.cwd(),'src/lib/research/lab',file),'utf8'))))
}

export async function getLab(industryId:string){
  const [settings,latest,history,registry,daily,health,report,autoReanalysis]=await Promise.all([
    labSettings(industryId),
    prisma.rawPayload.findFirst({where:{datasetKey:'strategy_lab_experiment',targetCode:industryId},orderBy:{fetchedAt:'desc'}}),
    prisma.rawPayload.findMany({where:{datasetKey:'strategy_lab_experiment',targetCode:industryId},orderBy:{fetchedAt:'desc'},take:12,select:{id:true,fetchedAt:true}}),
    prisma.rawPayload.findFirst({where:{datasetKey:'strategy_lab_recommendation',targetCode:industryId},orderBy:{fetchedAt:'desc'}}),
    prisma.rawPayload.findFirst({where:{datasetKey:'strategy_lab_daily',targetCode:industryId},orderBy:{fetchedAt:'desc'}}),
    prisma.rawPayload.findUnique({where:{id:`unified-pipeline:${industryId}`}}),
    prisma.aIAnalysisReport.findFirst({where:{type:'comprehensive',industryId},orderBy:{createdAt:'desc'},select:{id:true,dataJson:true}}),
    latestAutoReanalysis(industryId),
  ])
  if(latest&&hash(JSON.parse(latest.payload))!==latest.contentHash)throw new Error('实验结果校验失败，请重新运行，不使用被改写的结果生成动作')
  const reportData=report?.dataJson?JSON.parse(report.dataJson):null
  const reanalysis=autoReanalysis&&(!reportData?.autoReanalysis||Date.parse(autoReanalysis.assessedAt)>=Date.parse(reportData.autoReanalysis.assessedAt))?autoReanalysis:reportData?.autoReanalysis
  const loopMetrics=reportData?researchLoopMetrics(reportData.investmentAdvice,new Date().toISOString(),reanalysis):null
  return {loopMetrics,health:health?JSON.parse(health.payload):null,settings,experiment:latest?JSON.parse(latest.payload) as LabExperiment:null,history:history.map(r=>({id:r.id,createdAt:r.fetchedAt.toISOString()})),recommendation:registry?JSON.parse(registry.payload):null,daily:daily?JSON.parse(daily.payload):null}
}

async function executeExperiment(industryId:string,snapshotId?:string){
  const latest=snapshotId?{id:snapshotId}:await prisma.rawPayload.findFirst({where:{datasetKey:'research_snapshot',targetCode:industryId},orderBy:{fetchedAt:'desc'},select:{id:true}})
  if(!latest)throw new Error('请先运行综合分析，建立已核验的研究快照')
  const snapshot=await readSnapshot(latest.id)
  if(snapshot.profile.industryId!==industryId)throw new Error('研究快照不属于本领域')
  const vintages=await prisma.rawPayload.findMany({where:{datasetKey:{in:['strategy_lab_input','strategy_lab_price_history']},targetCode:industryId},orderBy:{fetchedAt:'desc'}})
  const data=extendDataset(datasetFromSnapshot(snapshot),vintages.map(row=>readVerifiedArchive<LabDataset>(row))),implementation=await engineHash()
  const baseSpecs=EXPERIMENT_STRATEGIES.map(spec=>({...spec,version:`${LAB_VERSION}:${implementation.slice(0,12)}`,id:`${spec.id}:${implementation.slice(0,12)}`}))
  const candidateRows=await prisma.rawPayload.findMany({where:{datasetKey:'strategy_lab_candidate',targetCode:industryId},orderBy:{fetchedAt:'asc'}})
  const candidates=candidateRows.map(row=>JSON.parse(row.payload)).filter(row=>row.implementation===implementation)
  const specs=[...baseSpecs,...candidates.map(row=>row.spec as typeof STRATEGIES[number])]
  const now=new Date().toISOString(),boundary=sessionBoundary(snapshot.calendar,now)
  const sourceDate=data.benchmarkBars.at(-1)?.date
  const next=snapshot.calendar.filter(day=>day.open&&Date.parse(`${day.date}T09:30:00+08:00`)>Date.parse(now)).sort((a,b)=>a.date.localeCompare(b.date))[0]
  const registryId=`strategy-lab-registry:${industryId}:${implementation}`
  await immutable(registryId,'strategy_lab_registry',industryId,{registeredAt:now,implementation,specs,families:ENTRY_FAMILIES,costs:{commissionBps:3,slippageBps:5},objective:'three-entry-families-by-three-risk-budgets',promotion:'paper-candidates-only',protocol:'九种假设同时登记；历史已被查看，只用于诊断。固定仓位/等权选取/双倍成本对照；未来归档计划独立评价，不因历史最佳自动切换账户。'})
  const settings=await labSettings(industryId)
  const decisionVersions=await listUnifiedDecisionVersions(industryId)
  const linkedDecision=decisionVersions.find(item=>item.snapshotId===snapshot.id)||null
  const priorRecords=await prisma.rawPayload.findMany({where:{datasetKey:'strategy_lab_plan',targetCode:industryId},orderBy:{fetchedAt:'asc'}})
  const priorPlans=priorRecords.map(row=>JSON.parse(row.payload) as TargetPlan&{implementation:string}).filter(p=>p.implementation===implementation)
  const fresh=boundary.verified&&sourceDate===boundary.expectedSession&&data.assets.length>0&&data.assets.every(a=>a.bars.at(-1)?.date===sourceDate)
  if(settings.enabled&&fresh&&next&&sourceDate){
    const evaluation=evaluateResearch(snapshot)
    for(const spec of specs){
      const id=`strategy-lab-plan:${industryId}:${spec.id}:${sourceDate}`
      const prior=priorPlans.filter(p=>p.strategyId===spec.id&&p.rebalance!==false).at(-1)
      const elapsed=prior?.scheduledSession?snapshot.calendar.filter(day=>day.open&&day.date>prior.scheduledSession!&&day.date<=next.date).length:spec.rebalanceSessions
      const plan={...attachFrozenModules(targetPlan(data,spec,sourceDate,now,`${next.date}T15:00:00+08:00`),evaluation),id,scheduledSession:next.date,rebalance:elapsed>=spec.rebalanceSessions,decisionVersionId:linkedDecision?.id||null,policyVersionId:registryId}
      // Data frozen with each forward plan survives operational snapshot cleanup.
      await immutable(`strategy-lab-input:${hash(data)}`,'strategy_lab_input',industryId,data)
      const evidenceIds=new Set(plan.features.flatMap(f=>f.modules.flatMap(m=>m.evidenceIds||[])))
      const modulePacket={evidence:snapshot.evidence.filter(e=>evidenceIds.has(e.id)),records:Object.fromEntries(Object.entries(snapshot.records||{}).filter(([key])=>evidenceIds.has(key)))}
      await immutable(`strategy-lab-module-input:${hash(modulePacket)}`,'strategy_lab_module_input',industryId,modulePacket)
      await immutable(id,'strategy_lab_plan',industryId,{...plan,inputHash:hash(data),registryId,implementation,moduleInputHash:hash(modulePacket)})
    }
  }
  const records=await prisma.rawPayload.findMany({where:{datasetKey:'strategy_lab_plan',targetCode:industryId},orderBy:{fetchedAt:'asc'}})
  const plans=records.map(row=>JSON.parse(row.payload) as TargetPlan&{implementation:string}).filter(p=>p.implementation===implementation)
  // Preserve each compact price vintage; select newest vintage for economic return accounting.
  // Older vintages are retained for exact experiment replay, never overwritten.
  await immutable(`strategy-lab-input:${hash(data)}`,'strategy_lab_input',industryId,data)
  const result:LabExperiment=runExperiment(data,plans,specs)
  result.dataStatus=fresh?'current':'stale'
  result.policyVersionId=registryId
  result.decisionVersionId=linkedDecision?.id||null
  result.decisionHistory=assessDecisionHistory(decisionVersions,snapshot)
  await archiveDecisionHistory(result.decisionHistory)
  if(linkedDecision?.allocation){
    const {runUnifiedValidation}=await import('../strategy/validation-store')
    const validation=await runUnifiedValidation(industryId,{expectedDecisionVersionId:linkedDecision.id})
    result.unifiedValidation={id:validation.id,status:validation.result.status,accepted:validation.result.accepted,exactReplayVerified:validation.result.exactReplayVerified}
  }
  result.limitations.push(fresh?'前瞻计划仅在启用后归档；新计划的结果需等待未来行情。':'当前行情已过期或缺失；只运行历史诊断，不回填前瞻计划。')
  const input={data,plans,specs,implementation,fresh,decisionHistory:result.decisionHistory,decisionVersionId:result.decisionVersionId,policyVersionId:registryId,unifiedValidation:result.unifiedValidation}
  const id=`strategy-lab-experiment:${industryId}:${hash(input)}`
  await immutable(`${id}:manifest`,'strategy_lab_manifest',industryId,input)
  await immutable(id,'strategy_lab_experiment',industryId,result)
  if(settings.enabled){
    for(const spec of proposeChallengers(result,specs)){
      await immutable(`strategy-lab-candidate:${industryId}:${spec.id}`,'strategy_lab_candidate',industryId,{spec,implementation,registeredAt:now,parentExperimentId:id,reason:'历史模块移除对照改善净收益且未增加回撤；仅获准从下一轮开始前瞻模拟'})
    }
  }
  // Autonomous selection is restricted to shadow research. No account caps or orders are changed.
  const eligible=result.strategies.filter(s=>s.promotion.status==='eligible-for-review').sort((a,b)=>(b.forward.excessReturnPct||0)-(a.forward.excessReturnPct||0))
  const rollbackQualified=result.strategies.filter(s=>s.rolling.status==='historical-qualified').sort((a,b)=>b.rolling.stabilityScore-a.rolling.stabilityScore)
  const candidate=eligible[0]||rollbackQualified[0]
  await immutable(`${id}:recommendation`,'strategy_lab_recommendation',industryId,{asOf:now,candidateId:candidate?.spec.id||null,decisionVersionId:result.decisionVersionId,policyVersionId:registryId,
    stage:eligible.length?'paper-review':rollbackQualified.length?'forward-candidate':'collecting-evidence',accountChanged:false,
    reason:eligible.length?'前瞻门槛通过，列入候选复核；产品与基准口径尚需核验':rollbackQualified.length?'历史滚动窗口通过，已进入前瞻模拟候选；不自动改变正式账户策略':'尚无通过历史稳定性与前瞻门槛的候选，继续多档比较'})
  return result
}
export function runLab(industryId:string,snapshotId?:string){
  const key=`${industryId}:${snapshotId||"latest"}`
  const existing=inFlight.get(key)
  if(existing)return existing
  const pending=withResearchLease('lab',industryId,()=>executeExperiment(industryId,snapshotId)).finally(()=>inFlight.delete(key))
  inFlight.set(key,pending)
  return pending
}

export async function verifyLatestExperiment(industryId:string){
  const row=await prisma.rawPayload.findFirst({where:{datasetKey:'strategy_lab_experiment',targetCode:industryId},orderBy:{fetchedAt:'desc'}})
  if(!row)throw new Error('没有可复现的实验')
  const manifest=await prisma.rawPayload.findUnique({where:{id:`${row.id}:manifest`}})
  if(!manifest||hash(JSON.parse(manifest.payload))!==manifest.contentHash||hash(JSON.parse(row.payload))!==row.contentHash)throw new Error('归档输入或结果校验失败')
  const input=JSON.parse(manifest.payload)
  if(input.implementation!==await engineHash())throw new Error('当前计算代码已变化；需切换到归档方法版本才能精确复现')
  const replay:LabExperiment=runExperiment(input.data,input.plans,input.specs),original=JSON.parse(row.payload)
  replay.policyVersionId=input.policyVersionId;replay.decisionVersionId=input.decisionVersionId;replay.decisionHistory=input.decisionHistory;replay.unifiedValidation=input.unifiedValidation
  // Runtime freshness note is separate from the deterministic simulation result.
  const core=(value:LabExperiment)=>{const normalized={...value};delete normalized.dataStatus;return {...normalized,limitations:value.limitations.slice(0,replay.limitations.length)}}
  if(hash(core(replay))!==hash(core(original)))throw new Error('组合净值、成交或模块结果无法精确复现')
  return {experimentId:row.id,verified:true,inputHash:manifest.contentHash,outputHash:row.contentHash}
}

export async function runEnabledLabs(){
  const rows=await prisma.rawPayload.findMany({where:{datasetKey:'strategy_lab_settings'}})
  const results:Array<{industryId:string;status:string;reason?:string}>=[]
  const now=new Date()
  if(!labRunDue(now))return results
  const today=chinaDate(now.toISOString())
  for(const row of rows){
    if(!JSON.parse(row.payload).enabled)continue
    const last=await prisma.rawPayload.findFirst({where:{datasetKey:'strategy_lab_daily',targetCode:row.targetCode},orderBy:{fetchedAt:'desc'}})
    if(!labRunDue(now,last))continue
    const checkpoint=async(status:string,reason?:string)=>{
      const id=`strategy-lab-daily:${row.targetCode}:${today}`,value={date:today,status,reason}
      const data={datasetKey:'strategy_lab_daily',targetCode:row.targetCode,provider:`strategy-lab/${LAB_VERSION}`,payload:JSON.stringify(value),contentHash:hash(value)}
      await prisma.rawPayload.upsert({where:{id},create:{id,...data},update:{...data,fetchedAt:new Date()}})
    }
    try{
      const {refreshUnifiedResearch}=await import('../refresh')
      const {experiment:result}=await refreshUnifiedResearch(row.targetCode)
      const {dailyExecution}=await import('./daily-store')
      const daily=await dailyExecution(row.targetCode)
      const status=result.dataStatus!=='current'?'waiting-data':daily.plan.blockers.length?'needs-review':'completed'
      await checkpoint(status)
      results.push({industryId:row.targetCode,status})
    }catch(error){const reason=error instanceof Error?error.message:'实验运行失败';await checkpoint('failed',reason);results.push({industryId:row.targetCode,status:'failed',reason})}
  }
  return results
}
