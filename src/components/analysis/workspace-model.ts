import { comprehensiveWorkflowDefinition } from '@/lib/workflow/comprehensive-definition'

export type RunStep = {
  id: string; stepName: string; stepIndex: number; status: string; duration?: number | null; error?: string | null;
  progress?: { current: number; total: number; message?: string } | null;
  artifacts: Array<{ artifactKey: string; data: unknown }>;
}
export type AnalysisRun = {
  id: string; status: string; startedAt: string; completedAt?: string | null; error?: string | null;
  metadata: { industryId: string; kind?: string; parentRunId?: string | null; baselineSnapshotId?: string | null; publicOnly?: boolean; rulesOnly?: boolean; verificationMode?: string | null };
  steps: RunStep[];
}
export type RunListItem = Omit<AnalysisRun, 'steps'> & { reportId?: string | null; progress: { total: number; completed: number; percentage: number } }
export const PHASES = comprehensiveWorkflowDefinition.phases.map(phase=>({id:phase.id,title:phase.title,caption:phase.caption,steps:comprehensiveWorkflowDefinition.nodes.filter(node=>node.phase===phase.id).map(node=>node.id)}))
export const STEP_TITLES: Record<string,string> = Object.fromEntries(comprehensiveWorkflowDefinition.nodes.map(node=>[node.id,node.title]))
export function artifact<T>(run: AnalysisRun | null, key: string): T | null {
  const value = run?.steps.flatMap(step => step.artifacts).find(a => a.artifactKey === key)?.data
  if (value == null) return null
  if (typeof value === 'string') { try { return JSON.parse(value) as T } catch { return value as T } }
  return value as T
}
export function phaseState(steps: RunStep[], names: readonly string[]) {
  const relevant = steps.filter(s=>names.includes(s.stepName))
  if (relevant.some(s=>s.status==='FAILED')) return 'failed'
  if (relevant.some(s=>s.status==='RUNNING')) return 'running'
  if (relevant.length && relevant.every(s=>s.status==='SKIPPED')) return 'skipped'
  if (relevant.length && relevant.every(s=>['COMPLETED','SKIPPED'].includes(s.status))) return 'completed'
  if (relevant.some(s=>s.status==='COMPLETED')) return 'running'
  return 'pending'
}
export function runProgress(run: AnalysisRun | null) {
  const total = PHASES.length
  if(!run)return {total,done:0,percent:0}
  const completion=PHASES.map(phase=>{
    if(phase.steps.length===0)return 1
    const steps=run.steps.filter(step=>(phase.steps as readonly string[]).includes(step.stepName))
    return steps.length?steps.filter(step=>['COMPLETED','SKIPPED'].includes(step.status)).length/phase.steps.length:0
  })
  const done=completion.filter(value=>value===1).length
  return {total,done,percent:Math.round(completion.reduce((sum,value)=>sum+value,0)/total*100)}
}
export function plainAnalysis(value: unknown): string {
  if (typeof value === 'string') { try {return plainAnalysis(JSON.parse(value))} catch {return value} }
  if (!value || typeof value !== 'object') return ''
  const row=value as Record<string,unknown>
  return String(row.analysis || row.thesis || row.outlook || '')
}
