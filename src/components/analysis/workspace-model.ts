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
export const shouldPollRun = (status?: string | null) => status==='PENDING'||status==='RUNNING'
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
  // The progress denominator is the executable topology, not the number of
  // visual phase groups. A persisted run is authoritative because older runs
  // may have been created from a different workflow definition.
  const stepNames = run
    ? [...new Set(run.steps.map(step=>step.stepName))]
    : comprehensiveWorkflowDefinition.nodes.map(node=>node.id)
  const total = stepNames.length
  if(!run)return {total,done:0,percent:0}
  // A completed run is the authoritative execution state. Older archived runs
  // can have fewer stored steps than the current workflow definition after a
  // workflow upgrade; presenting those reports as 91% complete is misleading.
  if(run.status==='COMPLETED')return {total,done:total,percent:100}
  const completed = new Set(run.steps.filter(step=>['COMPLETED','SKIPPED'].includes(step.status)).map(step=>step.stepName))
  const done=stepNames.filter(name=>completed.has(name)).length
  return {total,done,percent:total?Math.round(done/total*100):0}
}
export function plainAnalysis(value: unknown): string {
  if (typeof value === 'string') { try {return plainAnalysis(JSON.parse(value))} catch {return value} }
  if (!value || typeof value !== 'object') return ''
  const row=value as Record<string,unknown>
  return String(row.analysis || row.thesis || row.outlook || '')
}
