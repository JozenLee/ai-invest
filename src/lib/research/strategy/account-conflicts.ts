import type { DailyAccount } from '../lab/daily-plan'
import type { Evaluation } from '../contracts'
import type { UnifiedAllocation } from './kernel'
import type { UnifiedDecisionVersion } from '../decision-ledger'
import { fingerprint } from './kernel'

/** Cross-industry veto shared by report and daily plan; never another allocator. */
export async function accountConflictBlockers(industryId:string,allocation:UnifiedAllocation,evaluation:Evaluation,account:DailyAccount|null,now:string){
  if(!account)return {}
  const {prisma}=await import('@/lib/db')
  const rows=await prisma.rawPayload.findMany({where:{datasetKey:'unified_decision_version',targetCode:{not:industryId},fetchedAt:{gte:new Date(Date.parse(now)-7*86400000)}},orderBy:{fetchedAt:'desc'},take:300})
  const versions=rows.flatMap(row=>{try{const version=JSON.parse(row.payload) as UnifiedDecisionVersion;return fingerprint(version)===row.contentHash?[version]:[]}catch{return []}}).sort((a,b)=>b.generatedAt.localeCompare(a.generatedAt))
  const latest=new Map<string,UnifiedDecisionVersion>()
  for(const version of versions)if(!latest.has(version.industryId))latest.set(version.industryId,version)
  const blockers:Record<string,string[]>={}
  for(const product of evaluation.decisions){
    const peers=account.holdings.filter(holding=>holding.ticker===product.ticker||holding.targetEtfCode===product.ticker||product.indexCode&&holding.targetIndexCode===product.indexCode)
    const current=peers.reduce((sum,holding)=>sum+(holding.weightPct||0)/100,0)
    const target=Object.entries(allocation.targets).filter(([ticker])=>ticker===product.ticker||product.indexCode&&evaluation.decisions.find(p=>p.ticker===ticker)?.indexCode===product.indexCode).reduce((sum,[,weight])=>sum+weight,0)
    for(const other of latest.values()){
      if(!other.allocation||Date.parse(other.generatedAt)>Date.parse(now)||!(Date.parse(other.validUntil)>Date.parse(now)))continue
      const relevant=other.products.filter(p=>p.executionStatus==='verified'&&other.allocation?.decisions.find(row=>row.ticker===p.ticker)?.status!=='missing'&&(p.ticker===product.ticker||product.indexCode&&p.indexCode===product.indexCode))
      if(!relevant.length)continue
      const otherTarget=relevant.reduce((sum,p)=>sum+(other.allocation!.targets[p.ticker]||0),0)
      if((target-current)*(otherTarget-current)<-.000001)(blockers[product.ticker]??=[]).push('其他有效产业决策对同一指数暴露给出相反调整，需统一组合复核')
    }
  }
  return blockers
}
