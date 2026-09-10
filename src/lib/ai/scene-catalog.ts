export const AI_SCENES = {
  news: { label: '资讯流分类', description: '资讯分类、内容摘要与影响者内容采集分析', model: 'claude-sonnet-5', maxTokens: 4096, entries: ['资讯流自动分类 / 新闻分析队列', '/api/events/analyze → Python /api/ai/analyze', '/api/analysis/etf（事件解读）', '影响者内容分析'] },
  comprehensive: { label: '综合分析', description: '行业概览、市场、新闻、企业、组合分析及投资建议', model: 'claude-opus-5', maxTokens: 16384, entries: ['/api/analysis/comprehensive', '/api/analysis/industry/*', '/api/ai/analyze', '/api/ai/investment-advice', 'Python 产业市场与企业分析'] },
  graph: { label: '知识图谱', description: '产业探索、节点创建、实体提取、新闻关联与领域趋势', model: 'claude-sonnet-5', maxTokens: 8192, entries: ['/api/graph/*', 'Python 产业探索 / 搜索 / 领域趋势'] },
  matching: { label: 'ETF 与持仓匹配', description: 'ETF 与指数分类、指数匹配、持仓产业归属和 ETF 图谱分析', model: 'claude-sonnet-5', maxTokens: 8192, entries: ['Python ETF / 指数领域分类', 'ETF 指数匹配', '持仓产业匹配', 'ETF 图谱分析'] },
  event: { label: '事件影响分析', description: '事件对产业链的影响评估与传导分析', model: 'claude-sonnet-5', maxTokens: 4096, entries: ['事件影响分析服务'] },
} as const
export type AIScene = keyof typeof AI_SCENES
export type PublicAISetting = { scene: AIScene; model: string; maxTokens: number; tokenConfigured: boolean; tokenSource: 'scene' | 'global' | 'none'; customMaxTokens: boolean }

export type DisplayAISetting = PublicAISetting & { apiKey: string }
