import { readVerifiedArchive } from '../archive-json'
import { prisma } from '@/lib/db'
import { readSnapshot } from '../store'
import { listUnifiedDecisionVersions } from '../decision-ledger'
import { datasetFromSnapshot } from '../lab/experiment'
import { extendDataset } from '../lab/history'
import type { LabDataset } from '../lab/contracts'
import { archiveStrategyRecord } from './store'
import { createPolicy, fingerprint, type AllocationInput, type StrategyPolicy } from './kernel'
import { compareUnifiedStrategies, defaultProtocol, type ArchivedAllocation, type ValidationProtocol, type UnifiedValidation } from './validation'
import { withResearchLease } from '../lease'
import { readFile } from 'node:fs/promises'
import path from 'node:path'

async function sourceBundle(){return Object.fromEntries(await Promise.all(['kernel.ts','temporal.ts','validation.ts','../lab/simulator.ts','../lab/modules.ts','../lab/contracts.ts','../lab/history.ts'].map(async file=>[file,await readFile(path.join(process.cwd(),'src/lib/research/strategy',file),'utf8')])))}
async function implementation(){return fingerprint(await sourceBundle())}
export async function getUnifiedValidation(industryId:string){
  const [latest,policies,runs]=await Promise.all([
    prisma.rawPayload.findFirst({where:{datasetKey:'unified_strategy_validation',targetCode:industryId},orderBy:{fetchedAt:'desc'}}),
    prisma.rawPayload.findMany({where:{datasetKey:'unified_strategy_policy',targetCode:industryId},orderBy:{fetchedAt:'desc'},take:30}),
    prisma.rawPayload.findMany({where:{datasetKey:'unified_strategy_validation',targetCode:industryId},orderBy:{fetchedAt:'desc'},take:20,select:{id:true,fetchedAt:true}}),
  ])
  if(latest&&fingerprint(JSON.parse(latest.payload))!==latest.contentHash)throw new Error('验证结果哈希不一致')
  return {result:latest?JSON.parse(latest.payload) as UnifiedValidation:null,policies:policies.map(row=>JSON.parse(row.payload) as StrategyPolicy),runs}
}
export async function runUnifiedValidation(industryId:string,request:{expectedDecisionVersionId?:string;candidateId?:string;adjustmentScale?:number;policyPatch?:Partial<Pick<StrategyPolicy,'maxExposure'|'maxWeight'|'maxTurnover'|'minCash'|'filters'>>;protocol?:Partial<ValidationProtocol>}={}){
  return withResearchLease('validation',industryId,async()=>{
    const versions=await listUnifiedDecisionVersions(industryId,2000)
    const latest=request.expectedDecisionVersionId?versions.find(row=>row.id===request.expectedDecisionVersionId):versions.find(row=>row.allocation)
    if(!latest?.allocation)throw new Error('需要一份包含统一策略目标的新版综合报告；旧报告不补造历史仓位')
    const snapshotRow=await prisma.rawPayload.findUnique({where:{id:latest.snapshotId}})
    let frozenData:LabDataset
    if(snapshotRow)frozenData=datasetFromSnapshot(await readSnapshot(latest.snapshotId))
    else{
      const market=await prisma.rawPayload.findUnique({where:{id:`unified-market:${latest.snapshotId}`}})
      if(!market||market.targetCode!==industryId||fingerprint(JSON.parse(market.payload))!==market.contentHash)throw new Error('原快照与永久行情归档缺失或校验失败')
      frozenData=JSON.parse(market.payload)
    }
    const history=await prisma.rawPayload.findMany({where:{datasetKey:{in:['strategy_lab_input','strategy_lab_price_history']},targetCode:industryId},orderBy:{fetchedAt:'desc'}})
    const data=extendDataset(frozenData,history.map(row=>readVerifiedArchive<LabDataset>(row)))
    let candidate:StrategyPolicy
    if(request.candidateId){const row=await prisma.rawPayload.findUnique({where:{id:request.candidateId}});if(!row||row.targetCode!==industryId||row.datasetKey!=='unified_strategy_policy'||fingerprint(JSON.parse(row.payload))!==row.contentHash)throw new Error('候选策略不属于当前领域或校验失败');candidate=JSON.parse(row.payload)}
    else{const base=latest.allocation.strategy;candidate=createPolicy({industryId:base.industryId,maxExposure:base.maxExposure,maxWeight:base.maxWeight,maxTurnover:base.maxTurnover,minCash:base.minCash,filters:base.filters,model:base.model,promptHash:base.promptHash,implementationHash:base.implementationHash,parentId:latest.allocation.strategy.id,name:`综合策略对照 · 幅度${request.adjustmentScale??1}倍`,adjustmentScale:request.adjustmentScale??1,...request.policyPatch})}
    const archives:ArchivedAllocation[]=[]
    const missing:string[]=[]
    for(const version of versions.filter(row=>row.allocation)){
      const row=await prisma.rawPayload.findUnique({where:{id:`${version.allocation!.id}:input`}})
      if(!row||fingerprint(JSON.parse(row.payload))!==row.contentHash){missing.push(version.id);continue}
      archives.push({decisionId:version.id,availableAt:version.generatedAt,executionReady:version.reportQuality.usability==='advice-grade'&&version.reportQuality.executionReadinessScore===100,input:JSON.parse(row.payload) as AllocationInput,allocation:version.allocation!})
    }
    const protocol={...defaultProtocol(data),...request.protocol}
    const sources=await sourceBundle()
    const manifest={data,archives,candidate,protocol,implementation:fingerprint(sources),sources,missing}
    const result=compareUnifiedStrategies(data,archives,candidate,protocol)
    if(missing.length){result.exclusions.push(...missing.map(decisionId=>({decisionId,reason:'归档输入缺失或校验失败'})));result.exactReplayVerified=false;result.status='incomplete-coverage'}
    await archiveStrategyRecord(candidate.id,'unified_strategy_policy',industryId,candidate)
    const id=`unified-validation:${industryId}:${fingerprint(manifest)}`
    await archiveStrategyRecord(`${id}:manifest`,'unified_strategy_validation_input',industryId,manifest)
    await archiveStrategyRecord(id,'unified_strategy_validation',industryId,result)
    return {id,result}
  })
}
export async function verifyUnifiedValidation(industryId:string,id:string){
  const row=await prisma.rawPayload.findUnique({where:{id}}),manifest=await prisma.rawPayload.findUnique({where:{id:`${id}:manifest`}})
  if(!row||row.targetCode!==industryId||row.datasetKey!=='unified_strategy_validation'||!manifest||fingerprint(JSON.parse(row.payload))!==row.contentHash||fingerprint(JSON.parse(manifest.payload))!==manifest.contentHash)throw new Error('验证归档不存在或哈希校验失败')
  const input=JSON.parse(manifest.payload)
  if(input.implementation!==await implementation())throw new Error('计算代码已变化，需恢复归档实现版本后再精确重放')
  const result=compareUnifiedStrategies(input.data,input.archives,input.candidate,input.protocol)
  if(input.missing.length){result.exclusions.push(...input.missing.map((decisionId:string)=>({decisionId,reason:'归档输入缺失或校验失败'})));result.exactReplayVerified=false;result.status='incomplete-coverage'}
  if(fingerprint(result)!==row.contentHash)throw new Error('历史验证无法精确复现')
  return {verified:true,id,inputHash:manifest.contentHash,outputHash:row.contentHash}
}
