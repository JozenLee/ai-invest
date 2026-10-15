export type WorkflowResultMetric = { label: string; value: string }
export type WorkflowResultAssessment = { status: 'success' | 'warning' | 'failed' | 'pending'; label: string; detail: string }
export type WorkflowResultSummary = { headline: string; metrics: WorkflowResultMetric[]; highlights: string[]; assessment: WorkflowResultAssessment }
export type WorkflowResultContext = { stepStatus?: string; error?: string | null; methodId?: string | null }

export const WORKFLOW_RESULT_ARTIFACT_KEYS = [
  'domain-research',
  'decision-timing', 'research-preflight', 'graph-context-validation', 'graph-mapping-validation',
  'market-snapshot', 'market-reference-indicators', 'industry-info', 'etf-bindings', 'etf-market-data', 'etf-data-gaps',
  'holdings-summary', 'companies', 'company-codes', 'company-data-summary', 'news-evidence-gaps', 'news-sentiment',
  'portfolio-evidence', 'market-trends', 'data-quality', 'etf-actions', 'strategy-validation',
  'market-analysis', 'market-analysis-ai-status', 'market-analysis-validation',
  'news-analysis', 'news-analysis-ai-status', 'news-analysis-validation',
  'company-analysis', 'company-analysis-ai-status', 'company-analysis-validation',
  'industry-overview', 'industry-overview-ai-status', 'industry-overview-validation',
  'investment-advice', 'investment-advice-ai-status', 'investment-advice-validation', 'overall-score',
  'portfolio-decision-support', 'portfolio-analysis', 'social-report', 'social-report-status',
  'report-id', 'report-quality',
] as const

type StoredArtifact = { artifactKey: string; data: string | null }
type Row = Record<string, unknown>

function parseStored(value: string | null): unknown {
  if (!value) return null
  let parsed: unknown = value
  for (let index = 0; index < 2 && typeof parsed === 'string'; index++) {
    try { parsed = JSON.parse(parsed) } catch { break }
  }
  return parsed
}

const row = (value: unknown): Row => value && typeof value === 'object' && !Array.isArray(value) ? value as Row : {}
const rows = (value: unknown): Row[] => Array.isArray(value) ? value.filter(item => item && typeof item === 'object' && !Array.isArray(item)) as Row[] : []
const list = (value: unknown): string[] => Array.isArray(value) ? value.map(item => typeof item === 'string' ? item : String(row(item).name || row(item).title || row(item).detail || '')).filter(Boolean) : []
const clean = (value: unknown, limit = 1200) => String(value ?? '').replace(/[#*_`>\[\]]/g, '').replace(/\s+/g, ' ').trim().slice(0, limit)
const metric = (label: string, value: unknown): WorkflowResultMetric | null => value === null || value === undefined || value === '' ? null : { label, value: String(value) }
const percent = (value: unknown) => typeof value === 'number' && Number.isFinite(value) ? `${value.toFixed(1)}%` : null
const createSummary = (headline: unknown, metrics: Array<WorkflowResultMetric | null> = [], highlights: unknown[] = []): Omit<WorkflowResultSummary, 'assessment'> => ({
  headline: clean(headline) || '节点已完成，未生成可展示的业务结果。',
  metrics: metrics.filter((item): item is WorkflowResultMetric => Boolean(item)).slice(0, 6),
  highlights: highlights.map(item => clean(item, 360)).filter(Boolean).slice(0, 8),
})

function assessment(stepName: string, values: Map<string, unknown>, context: WorkflowResultContext): WorkflowResultAssessment {
  const status = context.stepStatus || 'COMPLETED'
  if (status === 'FAILED') return { status: 'failed', label: '运行失败', detail: context.error || '节点执行失败，请查看错误详情后重试。' }
  if (status === 'RUNNING') return { status: 'pending', label: '正在运行', detail: '节点仍在执行，结果会在完成后自动更新。' }
  if (status === 'PENDING') return { status: 'pending', label: '等待运行', detail: '上游依赖尚未全部就绪。' }
  if (status === 'SKIPPED') return { status: 'warning', label: '已跳过', detail: '该节点按本轮执行条件跳过。' }

  const aiStatus = [...values.entries()].find(([key]) => key.endsWith('-ai-status'))?.[1]
  if (row(aiStatus).status === 'fallback') return { status: 'warning', label: '完成但发生降级', detail: clean(row(aiStatus).reason) || '智能分析未按首选路径完成，已使用降级结果。' }
  if (stepName === 'freeze-research') {
    const preflight = row(values.get('research-preflight'))
    if (preflight.status === 'blocked') return { status: 'failed', label: '数据冻结失败', detail: list(preflight.warnings)[0] || '关键研究数据未通过冻结门禁。' }
    if (preflight.status !== 'fresh') return { status: 'warning', label: '冻结完成但有数据提示', detail: '部分订阅刷新存在提示，系统已保留可核验缓存并继续执行；具体缺口列在下方关键明细中。' }
  }
  if (stepName === 'assess-data-quality') {
    const quality = row(values.get('data-quality'))
    if (quality.status !== 'available') return { status: quality.status === 'blocked' ? 'failed' : 'warning', label: quality.status === 'blocked' ? '质量门禁失败' : '质量门禁受限', detail: `可用技术样本 ${quality.usable ?? 0}/${quality.requested ?? 0}，下游结论将受数据边界约束。` }
  }
  if (stepName === 'fetch-etf-data') {
    const gaps = row(values.get('etf-data-gaps')), missing = list(gaps.missingCodes)
    if (missing.length) return { status: 'warning', label: '行情读取完成但有缺失', detail: `缺失 ${missing.length} 只：${missing.join('、')}` }
  }
  if (stepName === 'portfolio-analysis' && values.get('portfolio-analysis') == null) return { status: 'success', label: '按隐私设置完成', detail: '本轮未授权向智能服务发送持仓名称、代码与比例，因此私有解释按设计跳过。' }
  const socialStatus = row(values.get('social-report-status'))
  if (stepName === 'social-report' && (socialStatus.status !== 'ready' || list(socialStatus.errors).length)) return { status: 'warning', label: '摘要生成需复核', detail: list(socialStatus.errors)[0] || clean(socialStatus.message) || '摘要未达到就绪状态。' }
  const deterministic = row(aiStatus).status === 'deterministic'
  return deterministic
    ? { status: 'success', label: '确定性处理成功', detail: clean(row(aiStatus).reason) || '节点按设计使用确定性规则完成，不属于异常降级。' }
    : { status: 'success', label: '运行成功', detail: '节点已完成并生成可用产物。' }
}

export function buildWorkflowResultSummary(stepName: string, artifacts: StoredArtifact[], progressMessage?: string | null, context: WorkflowResultContext = {}): WorkflowResultSummary {
  const values = new Map(artifacts.map(item => [item.artifactKey, parseStored(item.data)]))
  const get = (key: string) => values.get(key)
  const summary = (headline: unknown, metrics: Array<WorkflowResultMetric | null> = [], highlights: unknown[] = []): WorkflowResultSummary => ({ ...createSummary(headline, metrics, highlights), assessment: assessment(stepName, values, context) })

  if (stepName === 'freeze-research') {
    const timing = row(get('decision-timing')), preflight = row(get('research-preflight')), coverage = row(timing.quoteCoverage), graph = row(get('graph-context-validation')), mapping = row(get('graph-mapping-validation'))
    return summary(timing.label || progressMessage, [metric('数据时点', timing.asOf || timing.tradingDate), metric('交易口径', timing.phase), metric('行情覆盖', coverage.total ? `${coverage.fresh || 0}/${coverage.total}` : null), metric('同步成功/失败', `${preflight.completed || 0}/${preflight.failed || 0}`), metric('图谱结构', graph.status), metric('图谱映射', mapping.status)], [...list(timing.reasons), ...list(preflight.warnings), ...list(graph.issues), ...list(mapping.issues)])
  }
  if (stepName === 'fetch-market-snapshot') {
    const market = row(get('market-snapshot')), overview = row(market.overview), flow = row(market.capitalFlow), references = row(get('market-reference-indicators'))
    const indices = Array.isArray(market.overview) ? rows(market.overview) : rows(overview.indices)
    const sectors = rows(market.sectors).length || rows(flow.series).length || rows(flow.topInflowSectors).length + rows(flow.topOutflowSectors).length
    return summary(progressMessage, [metric('指数样本', indices.length), metric('板块资金样本', sectors), metric('读取时间', market.readAt || market.asOf), metric('主力资金参考', row(references.mainFlow).status || row(references.flow).status), metric('融资参考', row(references.margin).status), metric('数据来源', market.source)], indices.map(item => `${item.name || item.code || item.indexCode || '指数'} · ${item.date || item.tradeDate || item.dataDate || '日期待核验'}`))
  }
  if (stepName === 'fetch-etfs') {
    const bindings = rows(get('etf-bindings')), industry = row(get('industry-info'))
    const indexes = new Set(bindings.map(item => item.indexCode || item.index_code || item.indexName).filter(Boolean))
    return summary(progressMessage, [metric('纳入 ETF', bindings.length), metric('跟踪指数', indexes.size), metric('研究领域', industry.name), metric('数据来源', industry.source)], bindings.map(item => `${item.etf_name || item.name || item.etf_code || ''}${item.indexName ? ` · ${item.indexName}` : ''}`))
  }
  if (stepName === 'fetch-etf-data') {
    const gaps = row(get('etf-data-gaps')), market = rows(get('etf-market-data')), missing = list(gaps.missingCodes)
    const dates = market.map(item => String(item.dataDate || item.date || '')).filter(Boolean).sort()
    const usableHistory = market.filter(item => rows(item.history).length >= 30).length
    return summary(progressMessage, [metric('请求 ETF', gaps.requested ?? market.length + missing.length), metric('已取得', gaps.available ?? market.length), metric('历史样本合格', usableHistory), metric('缺失', missing.length), metric('最新交易日', dates.at(-1)), metric('数据来源', market[0]?.source)], missing.length ? [`缺失代码：${missing.join('、')}`] : market.map(item => `${item.name || item.ticker || 'ETF'} · ${item.dataDate || item.date || '日期待核验'} · ${rows(item.history).length}个历史点`))
  }
  if (stepName === 'fetch-etf-holdings') {
    const holdings = row(get('holdings-summary'))
    return summary(progressMessage || '持仓披露数据已汇总。', [metric('ETF', holdings.totalETFs), metric('持仓记录', holdings.totalHoldings), metric('底层公司', holdings.uniqueStocks), metric('披露期', holdings.reportPeriod)], rows(holdings.topStocks).map(item => `${item.stockName || item.stockCode || ''}${item.totalWeight != null ? ` · 汇总权重 ${item.totalWeight}` : ''}`))
  }
  if (stepName === 'fetch-companies') {
    const codes = String(get('company-codes') || '').split(',').filter(Boolean), companies = rows(get('companies'))
    return summary(progressMessage, [metric('企业样本', codes.length || companies.length), metric('筛选方法', context.methodId)], companies.map(item => `${item.stockName || item.name || item.stockCode || item.code || ''}${item.stage || item.segment ? ` · ${[item.stage,item.segment].filter(Boolean).join(' / ')}` : ''}`))
  }
  if (stepName === 'fetch-company-data') {
    const stored = row(get('company-data-summary')), quality = row(row(get('data-quality')).companyCoverage), coverage = Object.keys(stored).length ? stored : quality
    return summary(progressMessage || '企业行情、财报与公告证据已读取。', [metric('企业样本', coverage.total), metric('行情覆盖', coverage.quotes), metric('财报覆盖', coverage.financials), metric('利润增速可算', coverage.profitGrowth), metric('现金质量可算', coverage.cashQuality), metric('公告覆盖', coverage.announcements)], list(coverage.warnings))
  }
  if (stepName === 'fetch-news') {
    const gaps = row(get('news-evidence-gaps')), sentiment = row(get('news-sentiment'))
    return summary(progressMessage, [metric('候选资讯', gaps.fetched ?? gaps.candidates), metric('文本相关', gaps.textRelevant), metric('事件聚类', gaps.eventClusters ?? gaps.usable), metric('正文证据', gaps.usableEvidence ?? sentiment.evidenceEvents), metric('企业公告事件', gaps.announcementClusters ?? sentiment.announcementEvents), metric('待核验线索', gaps.leads), metric('事件发展情绪', sentiment.developmentTone), metric('加权情绪', typeof sentiment.score === 'number' ? sentiment.score.toFixed(3) : null), metric('最新事件', sentiment.latestPublishedAt)], [sentiment.freshness === '过期' ? '最新可用事件已超过48小时，结论需标注时效边界。' : '', sentiment.method, gaps.rule, gaps.taxonomyAvailable === false ? '事件分类体系不可用' : ''])
  }
  if (stepName === 'fetch-portfolio') {
    const portfolio = row(get('portfolio-evidence'))
    if (portfolio.excluded) return summary(portfolio.reason || progressMessage)
    return summary(progressMessage, [metric('持仓项', portfolio.holdingCount), metric('现金比例', percent(portfolio.cashWeightPct)), metric('前五集中度', percent(portfolio.topFiveWeightPct)), metric('领域暴露', percent(portfolio.industryWeightPct)), metric('持仓时点', portfolio.asOf), metric('数据来源', portfolio.source)])
  }
  if (stepName === 'calculate-market-trends') {
    const trends = row(get('market-trends')), etf = row(trends.etf), company = row(trends.company), overall = row(trends.overall), breadth = row(trends.indexBreadth)
    const trendText: Record<string, string> = { bullish: '偏强', bearish: '偏弱', neutral: '震荡', unknown: '未知' }
    return summary(breadth.mappedIndices != null ? '已按跟踪指数去重计算市场广度。' : `市场广度${trendText[String(overall.trend)] || overall.trend || '已计算'}。`, [metric('映射指数', breadth.mappedIndices), metric('有效指数', breadth.usableIndices), metric('站上20日线', breadth.aboveMA20), metric('指数覆盖率', typeof breadth.coverage === 'number' ? `${(breadth.coverage * 100).toFixed(0)}%` : null), metric('ETF 上涨/总数', etf.total != null ? `${etf.rising || 0}/${etf.total}` : null), metric('企业上涨/总数', company.total != null ? `${company.rising || 0}/${company.total}` : null)], [trends.source ? `计算口径：${trends.source}` : '', etf.avgChange != null ? `ETF 平均涨跌 ${etf.avgChange}%` : '', company.avgChange != null ? `企业平均涨跌 ${company.avgChange}%` : ''])
  }
  if (stepName === 'assess-data-quality') {
    const quality = row(get('data-quality')), company = row(quality.companyCoverage), modules = row(quality.modules)
    const labels: Record<string, string> = { available: '质量门禁通过', limited: '覆盖有限，结论受限', blocked: '质量门禁阻断' }
    const moduleDetails = Object.entries(modules).map(([key,value]) => `${key}：${row(value).status || '未知'} · ${row(value).detail || '无说明'}`)
    const limited = rows(quality.perEtf).filter(item => item.status !== 'available').map(item => `${item.ticker || 'ETF'}：${[...list(item.dataGaps),...list(item.signalGaps)].slice(0,4).join('、')}`)
    return summary(labels[String(quality.status)] || progressMessage, [metric('请求 ETF', quality.requested), metric('可用 ETF', quality.available), metric('技术样本', quality.usable), metric('覆盖率', typeof quality.coverage === 'number' ? `${(quality.coverage * 100).toFixed(0)}%` : null), metric('企业财报', company.total ? `${company.financials || 0}/${company.total}` : null), metric('事件数', quality.newsCount)], [...moduleDetails, ...list(quality.warnings || quality.limitations), ...limited])
  }
  if (stepName === 'etf-actions') {
    const actions = rows(get('etf-actions')), replay = row(get('strategy-validation')), counts = actions.reduce<Record<string, number>>((all, item) => { const state = String(item.state || 'unknown'); all[state] = (all[state] || 0) + 1; return all }, {})
    return summary(progressMessage, [metric('风险收缩', counts['risk-off'] || 0), metric('满足条件', counts.eligible || 0), metric('持续观察', (counts.watch || 0) + (counts.blocked || 0)), metric('决策数', actions.length), metric('规则回放', replay.validation), metric('冻结样本', replay.snapshots)], actions.map(item => `${item.ticker || ''} · ${item.heldAction || item.unheldAction || item.state || ''}${item.confidencePct != null ? ` · 置信度 ${item.confidencePct}` : ''}`))
  }
  if (stepName === 'market-analysis') {
    const analysis = row(get('market-analysis'))
    return summary(analysis.analysis || progressMessage, [metric('趋势', analysis.trend), metric('风险', analysis.risk_level), metric('模型评分', analysis.score), metric('分析维度', rows(analysis.dimensions).length), metric('引用证据', rows(analysis.evidence).length), metric('反证', list(analysis.counterEvidence).length)], [...rows(analysis.dimensions).map(item => `${item.name || '维度'}：${item.judgment || item.detail || ''}`), ...list(analysis.counterEvidence), ...list(analysis.watchlist)])
  }
  if (stepName === 'news-analysis') {
    const analysis = row(get('news-analysis'))
    return summary(analysis.analysis || progressMessage, [metric('情绪', analysis.sentiment), metric('催化事件', rows(analysis.catalysts).length), metric('风险事件', list(analysis.risks).length), metric('引用证据', rows(analysis.evidence).length), metric('观察项', list(analysis.watchlist).length)], [...rows(analysis.catalysts).map(item => `${item.event || '事件'}${item.path ? ` · ${item.path}` : ''}`), ...list(analysis.risks), ...list(analysis.watchlist)])
  }
  if (stepName === 'company-analysis') {
    const analysis = row(get('company-analysis')), companies = rows(analysis.key_companies), chain = list(analysis.chain_structure)
    return summary(analysis.analysis || progressMessage, [metric('代表企业', companies.length), metric('产业环节', chain.length), metric('引用证据', rows(analysis.evidence).length), metric('反证', list(analysis.counterEvidence).length), metric('观察项', list(analysis.watchlist).length)], [...companies.map(item => `${item.name || item.code || ''}${item.operatingEvidence ? ` · ${item.operatingEvidence}` : ''}${item.counterEvidence ? ` · 反证：${item.counterEvidence}` : ''}`), ...chain.map(item => `产业链：${item}`), ...list(analysis.counterEvidence)])
  }
  if (stepName === 'domain-research') {
    const research = row(get('domain-research')), opinion = row(research.opinion)
    return summary(opinion.conclusion || research.reason || progressMessage,
      [metric('长期判断', row(opinion.strategic).stance), metric('战术时机', row(opinion.tactical).stance), metric('反证', rows(opinion.counterEvidence).length)],
      rows(opinion.watchConditions).map(item => `${item.subject}：${item.observable}（${item.window}）→ ${item.consequence}`))
  }
  if (stepName === 'industry-overview') {
    const overview = row(get('industry-overview')), outlook = row(overview.outlook)
    return summary(overview.analysis || progressMessage, [metric('产业阶段', overview.stage), metric('关键信号环节', rows(overview.segmentSignals).length), metric('驱动因素', list(overview.drivers).length), metric('引用证据', rows(overview.evidence).length), metric('反证', list(overview.counterEvidence).length), metric('观察项', list(overview.watchlist).length)], [...list(overview.drivers), outlook.base ? `基准情景：${outlook.base}` : '', outlook.bull ? `乐观情景：${outlook.bull}` : '', outlook.bear ? `悲观情景：${outlook.bear}` : '', ...list(overview.counterEvidence)])
  }
  if (stepName === 'investment-advice') {
    const advice = row(get('investment-advice')), executive = row(advice.executiveSummary), action = row(executive.actionPlan), recommendation = row(advice.recommendation), rule = row(advice.ruleAssessment), overall = row(get('overall-score'))
    return summary(executive.conclusion || advice.thesis || progressMessage, [metric('研究评级', advice.rating), metric('模型评分', overall.score ?? advice.score), metric('综合置信度', advice.confidencePct != null ? `${advice.confidencePct}%` : null), metric('规则信号', rule.signal), metric('规则指数', rule.total), metric('产品比较', rows(advice.productSelection).length)], [action.priority, action.unheld, action.held, recommendation.reason, ...list(executive.mainRisks), ...list(advice.counterEvidence), ...list(advice.watchlist)])
  }
  if (stepName === 'portfolio-decision') {
    const decision = row(get('portfolio-decision-support'))
    if (!Object.keys(decision).length) return summary(progressMessage || '没有可用持仓，组合门禁按设计跳过。')
    return summary(decision.summary || progressMessage, [metric('实际持仓动作', rows(decision.actions).length), metric('组合置信度', decision.confidencePct != null ? `${decision.confidencePct}%` : null), metric('现金比例', percent(decision.cashWeightPct)), metric('领域暴露', percent(decision.industryWeightPct)), metric('映射覆盖', percent(decision.mappingCoveragePct)), metric('执行准备度', decision.readiness)], rows(decision.actions).map(item => `${item.name || item.ticker || ''} · ${item.action || item.state || ''}${item.reason ? ` · ${item.reason}` : ''}`))
  }
  if (stepName === 'portfolio-analysis') return summary(get('portfolio-analysis') || progressMessage || '本轮未生成私有组合解释。')
  if (stepName === 'social-report') {
    const report = row(get('social-report')), status = row(get('social-report-status'))
    return summary(report.title || progressMessage, [metric('摘要段落', rows(report.sections).length), metric('风险提示', list(report.risks).length), metric('核心结论', list(report.takeaways).length), metric('发布状态', status.status), metric('压缩校验', status.compacted === true ? '通过' : status.compacted === false ? '未通过' : null)], [report.subtitle, ...list(report.takeaways), ...list(report.risks), status.message])
  }
  if (stepName === 'generate-report') {
    const quality = row(get('report-quality')), reportId = get('report-id')
    return summary(reportId ? '完整报告已归档，可进入报告页查看结论、证据与审计链。' : progressMessage, [metric('报告编号', reportId), metric('参考价值', quality.overallScore != null ? `${quality.overallScore}/100` : null), metric('置信分', quality.confidenceScore != null ? `${quality.confidenceScore}/100` : null), metric('质量等级', quality.grade), metric('可用性', quality.usability)], list(quality.blockers))
  }
  return summary(progressMessage)
}
