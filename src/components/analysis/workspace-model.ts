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
export const PHASES = [
  { id: 'scope', title: '确认研究范围', caption: '领域 · 规则 · 隐私边界', steps: [] },
  { id: 'freeze', title: '同步并冻结证据', caption: '时效检查 · 版本快照', steps: ['freeze-research'] },
  { id: 'evidence', title: '构建研究数据包', caption: '市场 · 产品 · 企业 · 事件 · 组合', steps: ['fetch-market-snapshot','fetch-etfs','fetch-etf-data','fetch-etf-holdings','fetch-companies','fetch-company-data','fetch-news','fetch-portfolio','calculate-market-trends'] },
  { id: 'quality', title: '执行数据质量门禁', caption: '区分缺失、异常与弱势信号', steps: ['assess-data-quality'] },
  { id: 'analysis', title: '分域研判与产品规则', caption: '市场 · 事件 · 企业 · 逐只ETF', steps: ['etf-actions','market-analysis','news-analysis','company-analysis'] },
  { id: 'synthesis', title: '形成综合投资结论', caption: '行业总览 · 产品比较 · 情景与反证', steps: ['industry-overview','investment-advice'] },
  { id: 'portfolio', title: '结合持仓形成组合建议', caption: '风险预算 · 仓位调整 · 私有解释', steps: ['portfolio-decision','portfolio-analysis'] },
  { id: 'report', title: '编辑并归档报告', caption: '一页摘要 · 完整报告 · 版本链', steps: ['social-report','generate-report'] },
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
