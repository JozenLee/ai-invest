import { createHash } from 'node:crypto'
import type { WorkflowDefinition } from './types'

export function workflowDefinitionHash(definition:WorkflowDefinition){
  return createHash('sha256').update(JSON.stringify(definition)).digest('hex')
}
