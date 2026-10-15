import type { Evaluation } from '../contracts'
import type { ModuleValue, TargetPlan } from './contracts'

/** Financial and event features are observed only from the original frozen evaluation.
 * They start as shadow features: future outcomes must validate them before allocation uses them.
 */
export function attachFrozenModules(plan:TargetPlan,evaluation:Evaluation):TargetPlan{
  return {...plan,features:plan.features.map(feature=>{
    const decision=evaluation.decisions.find(d=>d.ticker===feature.ticker)
    const metrics:Array<[string,string,string]>=[['profit-growth','fundamental-profit','reported-yoy-pct'],['cash-quality','fundamental-cash','cash-conversion-pct']]
    const financial:ModuleValue[]=metrics.map(([key,id,unit])=>{
      const condition=decision?.conditions.find(c=>c.key===key)
      return {id,unit,version:'1',value:typeof condition?.value==='number'&&Number.isFinite(condition.value)?condition.value:null,evidenceIds:condition?.evidenceIds||[]}
    })
    const events=decision?.conditions.find(c=>c.key==='events')
    return {...feature,modules:[...feature.modules,...financial,{id:'event-evidence',version:'1',unit:'evidence-available-not-direction',value:typeof events?.value==='number'?events.value:null,evidenceIds:events?.evidenceIds||[]}]}
  })}
}
