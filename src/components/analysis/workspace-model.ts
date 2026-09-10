export type RunStep = {
  id: string; stepName: string; stepIndex: number; status: string; duration?: number | null; error?: string | null;
  dependencies?: string[];
  progress?: { current: number; total: number; message?: string } | null;
  artifacts: Array<{ artifactKey: string; data: unknown }>;
}
export type AnalysisRun = {
  id: string; status: string; startedAt: string; completedAt?: string | null; error?: string | null;
  metadata: { industryId: string; kind?: string; parentRunId?: string | null; baselineSnapshotId?: string | null; publicOnly?: boolean; rulesOnly?: boolean; verificationMode?: string | null };
  steps: RunStep[];
}
export type RunListItem = Omit<AnalysisRun, 'steps'> & { reportId?: string | null; progress: { total: number; completed: number; percentage: number } }
export const PHASES = [
  { id: 'data', title: '获取并校验原始数据', caption: '同步冻结 · 市场 · 产品 · 企业 · 事件 · 组合 · 质量门禁', steps: ['freeze-research','fetch-market-snapshot','fetch-etfs','fetch-etf-data','fetch-etf-holdings','fetch-companies','fetch-company-data','fetch-news','fetch-portfolio','calculate-market-trends','assess-data-quality'] },
  { id: 'analysis', title: '执行规则与 AI 分析', caption: '市场 · 事件 · 企业', steps: ['market-analysis','news-analysis','company-analysis'] },
  { id: 'output', title: '形成结论并排版输出', caption: '行业总览 · 综合结论 · 持仓建议 · 摘要 · 完整报告', steps: ['industry-overview','investment-advice','portfolio-decision','social-report','generate-report'] },
] as const
export const STEP_TITLES: Record<string,string> = {
  'freeze-research':'冻结配置与证据快照','fetch-market-snapshot':'市场指数与资金','fetch-etfs':'领域指数基金与指数映射','fetch-etf-data':'指数基金行情与复权指标','fetch-etf-holdings':'持仓与披露期','fetch-companies':'产业企业池','fetch-company-data':'企业财报与公告','fetch-news':'资讯清洗与事件归并','fetch-portfolio':'持仓权限边界','calculate-market-trends':'去重指数趋势','assess-data-quality':'分级数据质量检查','etf-actions':'逐只指数基金投资建议','portfolio-decision':'持仓穿透与组合仓位建议','market-analysis':'市场与资金分析','news-analysis':'产业事件分析','company-analysis':'企业景气分析','portfolio-analysis':'结合综合结论的私有持仓解释','industry-overview':'行业总览与反证','investment-advice':'AI综合投资结论','social-report':'一页摘要编辑','generate-report':'生成完整研究报告',
}
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
  const names = new Set<string>(PHASES.flatMap(phase => [...phase.steps]))
  // Historical runs retain their archived technical steps; new runs use the current definition.
  const steps = run?.steps.filter(step => names.has(step.stepName) || ['etf-actions','portfolio-analysis'].includes(step.stepName))
  const total = steps?.length || names.size
  const done = steps?.filter(step => ['COMPLETED','SKIPPED'].includes(step.status)).length || 0
  return {total, done, percent: Math.round(done / total * 100)}
}
export function plainAnalysis(value: unknown): string {
  if (typeof value === 'string') { try {return plainAnalysis(JSON.parse(value))} catch {return value} }
  if (!value || typeof value !== 'object') return ''
  const row=value as Record<string,unknown>
  return String(row.analysis || row.thesis || row.outlook || '')
}
