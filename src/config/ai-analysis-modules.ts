export type AIAnalysisModuleId = 'market' | 'news' | 'company' | 'comprehensive'

export interface AIAnalysisModuleConfig {
  id: AIAnalysisModuleId
  title: string
  description: string
  detail: string
  reportTitle: string
  reportType: AIAnalysisModuleId
  analysisPath: string
}

export const AI_ANALYSIS_MODULES: AIAnalysisModuleConfig[] = [
  {
    id: 'market',
    title: '大盘趋势分析',
    description: '匹配相关 ETF 与指数，计算趋势指标，并生成可核对的市场分析报告',
    detail: '匹配 ETF 与指数行情，计算技术指标并生成市场报告',
    reportTitle: '大盘趋势分析报告',
    reportType: 'market',
    analysisPath: 'market',
  },
  {
    id: 'news',
    title: '资讯与产业链分析',
    description: '结合近期新闻、产业知识图谱和产业链节点，生成可追溯的热点影响分析报告',
    detail: '采集近期资讯并映射产业链阶段与节点',
    reportTitle: '资讯与产业链分析报告',
    reportType: 'news',
    analysisPath: 'news',
  },
  {
    id: 'company',
    title: '企业发展趋势',
    description: '分析产业链相关企业发展趋势，识别头部企业动态',
    detail: '读取企业图谱，整理行情、财报和公告数据',
    reportTitle: '企业发展趋势分析报告',
    reportType: 'company',
    analysisPath: 'companies',
  },
  {
    id: 'comprehensive',
    title: '综合投资分析',
    description: '整合企业、市场和资讯分析，生成综合投资判断',
    detail: '汇总三类分析结果，形成综合投资报告',
    reportTitle: '综合投资分析报告',
    reportType: 'comprehensive',
    analysisPath: 'comprehensive',
  },
]

export function getAIAnalysisModule(id: string): AIAnalysisModuleConfig {
  const analysisModule = AI_ANALYSIS_MODULES.find((item) => item.id === id)
  if (!analysisModule) throw new Error(`Unknown AI analysis module: ${id}`)
  return analysisModule
}

export function buildAIAnalysisEndpoint(
  analysisModule: AIAnalysisModuleConfig,
  industryId: string,
  industryName: string,
  periodDays = 90,
  options?: { generateAiReport?: boolean; topCompanies?: string[] }
) {
  const params = new URLSearchParams({ period_days: String(periodDays) })
  if (analysisModule.id !== 'company') params.set('industry_name', industryName)
  if (analysisModule.id === 'news') params.set('limit', '12')

  // 企业分析模块：支持两阶段调用
  if (analysisModule.id === 'company') {
    // 第一阶段：获取数据时禁用AI报告（避免后端AI筛选阻塞）
    if (options?.generateAiReport === false) {
      params.set('generate_ai_report', 'false')
    }
    // 第二阶段：传入前端筛选的top企业，生成AI报告
    if (options?.topCompanies && options.topCompanies.length > 0) {
      params.set('generate_ai_report', 'true')
      params.set('top_companies', options.topCompanies.join(','))
    }
  }

  return `/api/analysis/industry/${encodeURIComponent(industryId)}/${analysisModule.analysisPath}?${params.toString()}`
}

export function buildAnalysisReportPayload(
  analysisModule: AIAnalysisModuleConfig,
  industryId: string,
  industryName: string,
  content: string,
  data: unknown,
) {
  return {
    type: analysisModule.reportType,
    industryId,
    industryName,
    title: `${industryName} ${analysisModule.reportTitle}`,
    summary: `基于 AI 分析页“${analysisModule.title}”生成的报告`,
    content,
    data,
  }
}
