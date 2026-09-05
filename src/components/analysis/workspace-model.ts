export type RunStep = {
  id: string; stepName: string; stepIndex: number; status: string; duration?: number | null; error?: string | null;
  progress?: { current: number; total: number; message?: string } | null;
  artifacts: Array<{ artifactKey: string; data: unknown }>;
}
export type AnalysisRun = {
  id: string; status: string; startedAt: string; completedAt?: string | null; error?: string | null;
  metadata: { industryId: string; kind?: string; parentRunId?: string | null; baselineSnapshotId?: string | null; publicOnly?: boolean; rulesOnly?: boolean };
  steps: RunStep[];
}
export type RunListItem = Omit<AnalysisRun, 'steps'> & { reportId?: string | null; progress: { total: number; completed: number; percentage: number } }
export const PHASES = [
  { id: 'data', title: '冻结研究数据', caption: '行情 · 企业 · 事件', steps: ['freeze-research','fetch-market-snapshot','fetch-etfs','fetch-etf-data','fetch-etf-holdings','fetch-companies','fetch-company-data','fetch-news','fetch-portfolio','calculate-market-trends'] },
  { id: 'review', title: '证据复核与决策', caption: '逐标的质量门禁', steps: ['assess-data-quality','etf-actions'] },
  { id: 'ai', title: '智能综合研判', caption: '解释证据与反证', steps: ['market-analysis','news-analysis','company-analysis','portfolio-analysis','industry-overview','investment-advice'] },
  { id: 'report', title: '报告与版本归档', caption: '保留可追溯结论', steps: ['social-report','generate-report'] },
] as const
export const STEP_TITLES: Record<string,string> = {
  'freeze-research':'冻结配置与证据快照','fetch-market-snapshot':'市场指数与资金','fetch-etfs':'领域指数基金与指数映射','fetch-etf-data':'指数基金行情与复权指标','fetch-etf-holdings':'持仓与披露期','fetch-companies':'产业企业池','fetch-company-data':'企业财报与公告','fetch-news':'资讯清洗与事件归并','fetch-portfolio':'持仓权限边界','calculate-market-trends':'去重指数趋势','assess-data-quality':'分级数据质量检查','etf-actions':'逐只指数基金规则决策','market-analysis':'市场与资金分析','news-analysis':'产业事件分析','company-analysis':'企业景气分析','portfolio-analysis':'私有持仓分析','industry-overview':'行业总览与反证','investment-advice':'指数基金研究论点','social-report':'一页摘要编辑','generate-report':'生成完整研究报告',
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
  const total = run?.steps.length || 20
  const done = run?.steps.filter(s=>['COMPLETED','SKIPPED'].includes(s.status)).length || 0
  return { total, done, percent: Math.round(done/total*100) }
}
export function plainAnalysis(value: unknown): string {
  if (typeof value === 'string') { try {return plainAnalysis(JSON.parse(value))} catch {return value} }
  if (!value || typeof value !== 'object') return ''
  const row=value as Record<string,unknown>
  return String(row.analysis || row.thesis || row.outlook || '')
}
