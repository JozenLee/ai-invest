export const ANALYSIS_MODULE_ORDER = ['market', 'news', 'company', 'portfolio', 'overview'] as const

export type AnalysisPipelineModule = (typeof ANALYSIS_MODULE_ORDER)[number]

export type AnalysisPipelineStep = {
  id: string
  module: AnalysisPipelineModule
  label: string
  detail: string
  kind?: 'data' | 'ai'
}

export const ANALYSIS_PIPELINE_MODULES: Array<{ key: AnalysisPipelineModule; label: string; detail: string }> = [
  { key: 'market', label: '市场', detail: '行情、指数与趋势信号' },
  { key: 'news', label: '资讯', detail: '产业资讯与影响方向' },
  { key: 'company', label: '企业', detail: '企业、财报与公告' },
  { key: 'portfolio', label: '持仓', detail: '组合结构与持仓行情' },
  { key: 'overview', label: '总览', detail: '证据汇总与 AI 判断' },
]

export const DEFAULT_AI_MODULES: Record<AnalysisPipelineModule, boolean> = {
  market: true,
  news: false,
  company: true,
  portfolio: false,
  overview: true,
}

export function normalizeAiModuleConfig(value: unknown): Record<AnalysisPipelineModule, boolean> {
  const input = value && typeof value === 'object' ? value as Record<string, unknown> : {}
  return Object.fromEntries(ANALYSIS_MODULE_ORDER.map((module) => [module, input[module] !== false])) as Record<AnalysisPipelineModule, boolean>
}

export const ANALYSIS_PIPELINE_STEPS: AnalysisPipelineStep[] = [
  { id: 'market.graph', module: 'market', label: '读取图谱候选', detail: '读取产业图谱绑定的 ETF 与指数候选' },
  { id: 'market.quote', module: 'market', label: '获取 ETF 行情', detail: '获取历史行情与有效样本' },
  { id: 'market.index', module: 'market', label: '获取指数与资金', detail: '获取指数、板块资金与市场概览' },
  { id: 'market.signal', module: 'market', label: '计算趋势指标', detail: '计算趋势、波动、回撤与量化评分' },
  { id: 'market.report', module: 'market', label: '生成AI分析报告', detail: '基于市场数据生成可核对的趋势报告', kind: 'ai' },
  { id: 'news.graph', module: 'news', label: '读取产业资讯', detail: '读取已完成产业链标注的新闻' },
  { id: 'news.validate', module: 'news', label: '校验资讯字段', detail: '校验标题、正文、时间与来源' },
  { id: 'news.impact', module: 'news', label: '生成AI报告', detail: '基于资讯、情绪与产业链关联生成分析报告', kind: 'ai' },
  { id: 'company.candidates', module: 'company', label: '确定企业候选', detail: '根据图谱或 ETF 持仓确定企业范围' },
  { id: 'company.data', module: 'company', label: '读取企业数据', detail: '读取行情、财报、公告与产业链关系' },
  { id: 'company.metrics', module: 'company', label: '计算企业指标', detail: '计算代表性、覆盖度与综合指标' },
  { id: 'company.report', module: 'company', label: '生成AI分析报告', detail: '基于企业证据生成发展趋势报告', kind: 'ai' },
  { id: 'portfolio.read', module: 'portfolio', label: '读取持仓组合', detail: '读取默认组合、数量与组合权重' },
  { id: 'portfolio.quote', module: 'portfolio', label: '补充持仓行情', detail: '补充价格、涨跌与趋势信息' },
  { id: 'overview.quality', module: 'overview', label: '评估数据质量', detail: '汇总覆盖度、完整性与质量门禁' },
  { id: 'overview.evidence', module: 'overview', label: '汇总分析证据', detail: '建立可追溯的模块证据链' },
  { id: 'overview.ai', module: 'overview', label: '生成AI分析报告', detail: '基于全部已完成模块生成综合判断与投资策略', kind: 'ai' },
]

export function getAnalysisPipelineSteps(module: AnalysisPipelineModule) {
  return ANALYSIS_PIPELINE_STEPS.filter((step) => step.module === module)
}
