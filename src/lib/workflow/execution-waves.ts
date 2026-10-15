import type {StepDefinition} from './types'

export function executionWaves(steps:StepDefinition[]){
  const byName=new Map(steps.map(step=>[step.name,step]))
  const remaining=new Set(steps.map(step=>step.name))
  const completed=new Set<string>()
  const waves:StepDefinition[][]=[]
  while(remaining.size){
    const ready=[...remaining].filter(name=>byName.get(name)!.dependencies.every(dependency=>completed.has(dependency)))
    if(!ready.length)throw new Error(`工作流依赖存在循环或缺失节点：${[...remaining].join(', ')}`)
    const wave=ready.map(name=>byName.get(name)!)
    waves.push(wave)
    ready.forEach(name=>{remaining.delete(name);completed.add(name)})
  }
  return waves
}

/** Keep a run non-terminal until every concurrently started node has settled. */
export async function settleExecutionWave(steps:StepDefinition[],execute:(step:StepDefinition)=>Promise<void>){
  const results=await Promise.allSettled(steps.map(step=>execute(step)))
  const failure=results.find((result):result is PromiseRejectedResult=>result.status==='rejected')
  if(failure)throw failure.reason
}
