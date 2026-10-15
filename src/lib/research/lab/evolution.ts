import type { LabExperiment } from './experiment'
import type { StrategySpec } from './contracts'

/** A bounded search: at most one challenger per risk budget, one removed module.
 * Historical improvement only earns a future paper trial, never production promotion.
 */
export function proposeChallengers(experiment:LabExperiment,existing:StrategySpec[]):StrategySpec[]{
  return experiment.strategies.flatMap(row=>{
    if(row.spec.id.includes(':without-')||existing.some(s=>s.id.startsWith(`${row.spec.id}:without-`))||row.historical.observations<126||row.rolling.status!=='historical-qualified')return []
    const candidates=row.ablations.filter(a=>a.incrementalReturnPct!==null&&a.incrementalReturnPct<0&&a.maxDrawdownPct!==null&&row.historical.maxDrawdownPct!==null&&a.maxDrawdownPct<=row.historical.maxDrawdownPct)
      .sort((a,b)=>a.incrementalReturnPct!-b.incrementalReturnPct!)
    const chosen=candidates[0]
    if(!chosen)return []
    return [{...row.spec,id:`${row.spec.id}:without-${chosen.removedModule}`,name:`${row.spec.name} · 移除${chosen.removedModule}候选`,modules:row.spec.modules.filter(id=>id!==chosen.removedModule)}]
  })
}
