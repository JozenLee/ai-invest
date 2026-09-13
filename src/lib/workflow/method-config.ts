import type { StepContext, WorkflowNodeConfig } from './types'

export function workflowNodeConfig(context:StepContext,nodeId:string):WorkflowNodeConfig|undefined{
  const value=context.input?.nodeConfigs?.[nodeId]
  return value&&typeof value==='object'?value as WorkflowNodeConfig:undefined
}

export function workflowEffort(context:StepContext,nodeId:string):'low'|'medium'|'high' {
  const value=workflowNodeConfig(context,nodeId)?.parameters.effort
  return value==='medium'||value==='high'?value:'low'
}

export function deterministicAnalysisSelected(context:StepContext,nodeId:string){
  return workflowNodeConfig(context,nodeId)?.methodId==='deterministic-analysis'
}

export function workflowInput<T>(context:StepContext,portId:string,artifactKey:string):T|undefined{
  return (context.inputs?.get(portId)??context.inputs?.get(artifactKey)??context.artifacts.get(artifactKey)) as T|undefined
}
