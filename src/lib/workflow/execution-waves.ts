import type {StepDefinition} from './types'

export function executionWaves(steps:StepDefinition[]){
  // Market and event analysis both call the same upstream model account.
  // Serialize requests so a long stream cannot starve another research module.
  return steps.map(step=>[step])
}
