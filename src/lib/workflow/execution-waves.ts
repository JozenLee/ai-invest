import type {StepDefinition} from './types'

export function executionWaves(steps:StepDefinition[]){
  // Event analysis is deterministic and can share the market wave. Two Opus
  // requests in parallel compete for account inference capacity and repeatedly
  // starved the company request, so company analysis starts after market.
  const parallelResearch=new Set(['market-analysis','news-analysis'])
  const waves:StepDefinition[][]=[]
  for(const step of steps){
    if(parallelResearch.has(step.name)){
      if(!waves.some(wave=>wave.some(candidate=>parallelResearch.has(candidate.name))))waves.push(steps.filter(candidate=>parallelResearch.has(candidate.name)))
      continue
    }
    waves.push([step])
  }
  return waves
}
