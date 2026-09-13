import type {
  WorkflowDefinition,
  WorkflowEdgeDefinition,
  WorkflowMethodDefinition,
  WorkflowNodeConfig,
  WorkflowNodeDefinition,
  WorkflowPortDefinition,
  WorkflowVisibility,
} from './types'

const phases = [
  { id: 'freeze', title: '冻结边界', caption: '研究范围、时效与版本快照', order: 0 },
  { id: 'universe', title: '标的与样本', caption: '指数基金、持仓与企业候选池', order: 1 },
  { id: 'evidence', title: '证据准备', caption: '市场、企业、事件与组合证据', order: 2 },
  { id: 'quality', title: '质量门禁', caption: '缺失、异常、时效与覆盖度', order: 3 },
  { id: 'analysis', title: '分域分析', caption: '市场、事件、企业与产品规则', order: 4 },
  { id: 'synthesis', title: '综合研判', caption: '行业总览、反证与投资结论', order: 5 },
  { id: 'portfolio', title: '组合决策', caption: '持仓穿透、风险预算与私有解释', order: 6 },
  { id: 'report', title: '报告归档', caption: '一页摘要、完整报告与审计链', order: 7 },
]

const deterministic: WorkflowMethodDefinition = {
  id: 'deterministic', version: '1.0.0', label: '确定性处理',
  description: '使用固定规则与已冻结数据执行，结果可重复。', fields: [],
}
const frozenProjection: WorkflowMethodDefinition = {
  id: 'frozen-projection', version: '1.0.0', label: '冻结快照投影',
  description: '优先读取本轮冻结快照，不在步骤执行时重新采集外部数据。', fields: [],
}
const hybridAi: WorkflowMethodDefinition = {
  id: 'hybrid-ai', version: '1.0.0', label: '规则约束 + AI 解释',
  description: '确定性规则负责边界和门禁，模型仅解释证据并输出结构化研判。',
  fields: [
    { id: 'effort', label: '推理强度', type: 'select', defaultValue: 'low', options: [{ label: '低', value: 'low' }, { label: '中', value: 'medium' }, { label: '高', value: 'high' }] },
  ],
}
const deterministicAnalysis: WorkflowMethodDefinition = {
  id: 'deterministic-analysis', version: '1.0.0', label: '仅确定性分析',
  description: '不调用模型，仅保留冻结数据、规则结果和可追溯的保守结论。', fields: [],
}

const input = (id: string, label: string, artifactKey: string, sourceNodeId: string, required = true, schemaId = artifactKey, confidentiality: WorkflowPortDefinition['confidentiality'] = 'public'): WorkflowPortDefinition => ({
  id, label, artifactKey, sourceNodeId, required, schemaId, schemaVersion: 1, confidentiality,
})
const output = (id: string, label: string, artifactKey: string, schemaId = artifactKey, confidentiality: WorkflowPortDefinition['confidentiality'] = 'public'): WorkflowPortDefinition => ({
  id, label, artifactKey, required: true, schemaId, schemaVersion: 1, confidentiality,
})

type NodeSeed = Omit<WorkflowNodeDefinition, 'version' | 'visibility' | 'estimatedDuration'> & { visibility?: WorkflowVisibility; estimatedDuration?: number }
const node = (seed: NodeSeed): WorkflowNodeDefinition => ({ version: '1.0.0', visibility: 'public', estimatedDuration: 1000, ...seed })

export const comprehensiveWorkflowNodes: WorkflowNodeDefinition[] = [
  node({ id: 'freeze-research', title: '数据冻结', description: '冻结领域配置、交易日历、图谱、行情、事件和研究证据。', phase: 'freeze', category: 'control', configurable: false, inputs: [], outputs: [output('snapshot', '冻结研究快照', 'research-snapshot'), output('manifest', '证据清单', 'research-manifest'), output('graph', '图谱版本', 'graph-context'), output('timing', '决策时效', 'decision-timing')], methods: [deterministic], defaultMethodId: 'deterministic' }),
  node({ id: 'fetch-market-snapshot', title: '市场行情快照', description: '从冻结快照投影市场指数、板块资金和参考指标。', phase: 'evidence', category: 'data', configurable: false, inputs: [input('snapshot', '冻结研究快照', 'research-snapshot', 'freeze-research')], outputs: [output('market', '市场行情', 'market-snapshot'), output('reference', '市场参考数据', 'market-reference-data')], methods: [frozenProjection], defaultMethodId: 'frozen-projection' }),
  node({ id: 'fetch-etfs', title: '标的指数与 ETF', description: '确定本领域实际进入研究的 ETF 与正式跟踪指数映射。', phase: 'universe', category: 'data', configurable: true, inputs: [input('snapshot', '冻结研究快照', 'research-snapshot', 'freeze-research')], outputs: [output('bindings', 'ETF 与指数映射', 'etf-bindings'), output('codes', 'ETF 代码集合', 'etf-codes'), output('industry', '研究领域', 'industry-info')], methods: [{ id: 'subscribed-bindings', version: '1.0.0', label: '订阅映射', description: '以已订阅产品和发布图谱的正式映射为范围。', fields: [{ id: 'minimumRelevance', label: '最低相关度', type: 'number', min: 0, max: 1, step: 0.05, defaultValue: 0.5 }] }], defaultMethodId: 'subscribed-bindings' }),
  node({ id: 'fetch-etf-data', title: 'ETF 行情与指标', description: '准备复权行情、技术指标、流动性和估值输入。', phase: 'evidence', category: 'data', configurable: false, inputs: [input('codes', 'ETF 代码集合', 'etf-codes', 'fetch-etfs'), input('snapshot', '冻结研究快照', 'research-snapshot', 'freeze-research')], outputs: [output('market', 'ETF 行情指标', 'etf-market-data'), output('gaps', 'ETF 数据缺口', 'etf-data-gaps')], methods: [frozenProjection], defaultMethodId: 'frozen-projection' }),
  node({ id: 'fetch-etf-holdings', title: 'ETF 成分持仓', description: '解析披露期持仓并汇总底层企业，不将历史权重视为实时权重。', phase: 'universe', category: 'data', configurable: false, inputs: [input('codes', 'ETF 代码集合', 'etf-codes', 'fetch-etfs'), input('market', 'ETF 行情指标', 'etf-market-data', 'fetch-etf-data')], outputs: [output('holdings', 'ETF 持仓', 'etf-holdings'), output('summary', '持仓汇总', 'holdings-summary')], methods: [frozenProjection], defaultMethodId: 'frozen-projection' }),
  node({ id: 'fetch-companies', title: '企业筛选', description: '结合 ETF 持仓和产业图谱形成分环节企业研究池。', phase: 'universe', category: 'data', configurable: true, inputs: [input('holdings', 'ETF 持仓', 'etf-holdings', 'fetch-etf-holdings'), input('graph', '产业图谱', 'graph-context', 'freeze-research')], outputs: [output('companies', '企业研究池', 'companies'), output('codes', '企业代码集合', 'company-codes')], methods: [{ id: 'etf-holdings-selection', version: '1.0.0', label: 'ETF 持仓企业池', description: '从正式 ETF 披露持仓中选择企业样本。', fields: [{ id: 'maxCompanies', label: '企业上限', type: 'number', min: 5, max: 100, step: 5, defaultValue: 30 }] },{ id: 'graph-intersection-selection', version: '1.0.0', label: '图谱交集企业池', description: '仅保留同时出现在 ETF 持仓与发布产业图谱中的企业。', fields: [{ id: 'maxCompanies', label: '企业上限', type: 'number', min: 5, max: 100, step: 5, defaultValue: 30 }] }], defaultMethodId: 'etf-holdings-selection' }),
  node({ id: 'fetch-company-data', title: '企业证据', description: '读取企业行情、多期财报、公告和产业环节位置。', phase: 'evidence', category: 'data', configurable: false, inputs: [input('companies', '企业研究池', 'companies', 'fetch-companies'), input('snapshot', '冻结研究快照', 'research-snapshot', 'freeze-research')], outputs: [output('evidence', '企业证据包', 'company-market-data')], methods: [frozenProjection], defaultMethodId: 'frozen-projection' }),
  node({ id: 'fetch-news', title: '事件证据', description: '清洗公告与资讯、归并重复事件并保留来源等级。', phase: 'evidence', category: 'data', configurable: true, inputs: [input('industry', '研究领域', 'industry-info', 'fetch-etfs'), input('snapshot', '冻结研究快照', 'research-snapshot', 'freeze-research')], outputs: [output('articles', '资讯证据', 'news-articles'), output('events', '事件集合', 'news-events'), output('gaps', '资讯缺口', 'news-evidence-gaps')], methods: [{ id: 'material-events', version: '1.0.0', label: '材料性事件归并', description: '按正文完整度、来源和材料性保留事件。', fields: [{ id: 'lookbackDays', label: '回看天数', type: 'number', min: 7, max: 90, step: 1, defaultValue: 30 }] }], defaultMethodId: 'material-events' }),
  node({ id: 'fetch-portfolio', title: '私有持仓快照', description: '在本地读取组合比例、集中度和产业暴露。', phase: 'evidence', category: 'data', visibility: 'private', configurable: false, inputs: [input('industry', '研究领域', 'industry-info', 'fetch-etfs')], outputs: [output('portfolio', '私有组合证据', 'portfolio-evidence', 'portfolio-evidence', 'private')], methods: [deterministic], defaultMethodId: 'deterministic' }),
  node({ id: 'calculate-market-trends', title: '市场趋势计算', description: '基于 ETF、企业和市场快照计算去重趋势与广度。', phase: 'evidence', category: 'rule', configurable: false, inputs: [input('etfs', 'ETF 行情', 'etf-market-data', 'fetch-etf-data'), input('companies', '企业证据', 'company-market-data', 'fetch-company-data'), input('market', '市场快照', 'market-snapshot', 'fetch-market-snapshot')], outputs: [output('trends', '市场趋势', 'market-trends')], methods: [deterministic], defaultMethodId: 'deterministic' }),
  node({ id: 'assess-data-quality', title: '数据质量门禁', description: '区分缺失、异常、过期和未满足条件，限制下游结论。', phase: 'quality', category: 'quality', configurable: false, inputs: [input('trends', '市场趋势', 'market-trends', 'calculate-market-trends'), input('news', '事件证据', 'news-articles', 'fetch-news'), input('companies', '企业证据', 'company-market-data', 'fetch-company-data'), input('holdings', 'ETF 持仓', 'etf-holdings', 'fetch-etf-holdings')], outputs: [output('quality', '质量评估', 'data-quality')], methods: [deterministic], defaultMethodId: 'deterministic' }),
  node({ id: 'etf-actions', title: 'ETF 规则决策', description: '逐 ETF 执行确定性规则、条件校验和变更记录。', phase: 'analysis', category: 'rule', configurable: true, inputs: [input('snapshot', '冻结研究快照', 'research-snapshot', 'freeze-research'), input('quality', '质量评估', 'data-quality', 'assess-data-quality')], outputs: [output('evaluation', '规则复核结果', 'research-evaluation'), output('actions', '逐 ETF 决策', 'etf-actions')], methods: [{ id: 'rule-engine', version: '1.0.0', label: '版本化规则引擎', description: '质量门禁优先，规则输出不能被模型覆盖。', fields: [{ id: 'strictUnknowns', label: '未知条件阻断新增风险', type: 'boolean', defaultValue: true }] }], defaultMethodId: 'rule-engine' }),
  node({ id: 'market-analysis', title: '市场行情分析', description: '解释趋势、广度、资金、流动性和多周期背离。', phase: 'analysis', category: 'ai', configurable: true, inputs: [input('quality', '质量评估', 'data-quality', 'assess-data-quality'), input('market', '市场快照', 'market-snapshot', 'fetch-market-snapshot'), input('trends', '市场趋势', 'market-trends', 'calculate-market-trends'), input('etfs', 'ETF 行情', 'etf-market-data', 'fetch-etf-data')], outputs: [output('analysis', '市场研判', 'market-analysis')], methods: [hybridAi,deterministicAnalysis], defaultMethodId: 'hybrid-ai', estimatedDuration: 300000 }),
  node({ id: 'news-analysis', title: '产业事件分析', description: '按来源等级和材料性解释事件影响与传导路径。', phase: 'analysis', category: 'ai', configurable: true, inputs: [input('quality', '质量评估', 'data-quality', 'assess-data-quality'), input('events', '事件证据', 'news-articles', 'fetch-news'), input('graph', '产业图谱', 'graph-context', 'freeze-research')], outputs: [output('analysis', '事件研判', 'news-analysis')], methods: [hybridAi,deterministicAnalysis], defaultMethodId: 'hybrid-ai', estimatedDuration: 90000 }),
  node({ id: 'company-analysis', title: '企业分析', description: '先看完整企业池景气广度，再以代表企业解释分化。', phase: 'analysis', category: 'ai', configurable: true, inputs: [input('quality', '质量评估', 'data-quality', 'assess-data-quality'), input('companies', '企业证据', 'company-market-data', 'fetch-company-data'), input('graph', '产业图谱', 'graph-context', 'freeze-research')], outputs: [output('analysis', '企业研判', 'company-analysis')], methods: [hybridAi,deterministicAnalysis], defaultMethodId: 'hybrid-ai', estimatedDuration: 300000, executionPolicy:{after:['market-analysis'],concurrencyGroup:'primary-ai',maxAttempts:2,timeoutMs:300000} }),
  node({ id: 'industry-overview', title: '行业总览与反证', description: '按产业链结构汇编市场、企业和事件结论。', phase: 'synthesis', category: 'ai', configurable: false, inputs: [input('market', '市场研判', 'market-analysis', 'market-analysis'), input('news', '事件研判', 'news-analysis', 'news-analysis'), input('company', '企业研判', 'company-analysis', 'company-analysis'), input('quality', '质量评估', 'data-quality', 'assess-data-quality')], outputs: [output('overview', '行业总览', 'industry-overview')], methods: [hybridAi], defaultMethodId: 'hybrid-ai' }),
  node({ id: 'investment-advice', title: '综合投资结论', description: '形成产品比较、估值、情景、反证和最终研究结论。', phase: 'synthesis', category: 'ai', configurable: true, inputs: [input('overview', '行业总览', 'industry-overview', 'industry-overview'), input('evaluation', '规则复核结果', 'research-evaluation', 'etf-actions'), input('quality', '质量评估', 'data-quality', 'assess-data-quality')], outputs: [output('advice', '综合投资结论', 'investment-advice')], methods: [hybridAi,deterministicAnalysis], defaultMethodId: 'hybrid-ai', estimatedDuration: 300000 }),
  node({ id: 'portfolio-decision', title: '组合投资决策', description: '在本地应用持仓穿透、风险预算、费用和时效门禁。', phase: 'portfolio', category: 'rule', visibility: 'private', configurable: false, inputs: [input('portfolio', '私有组合证据', 'portfolio-evidence', 'fetch-portfolio', false, 'portfolio-evidence', 'private'), input('actions', '逐 ETF 决策', 'etf-actions', 'etf-actions'), input('advice', '综合投资结论', 'investment-advice', 'investment-advice'), input('quality', '质量评估', 'data-quality', 'assess-data-quality')], outputs: [output('decision', '组合决策支持', 'portfolio-decision-support', 'portfolio-decision-support', 'private')], methods: [deterministic], defaultMethodId: 'deterministic' }),
  node({ id: 'portfolio-analysis', title: '私有组合解释', description: '在明确授权后解释综合结论对当前组合的影响。', phase: 'portfolio', category: 'ai', visibility: 'private', configurable: true, inputs: [input('decision', '组合决策支持', 'portfolio-decision-support', 'portfolio-decision', false, 'portfolio-decision-support', 'private'), input('advice', '综合投资结论', 'investment-advice', 'investment-advice')], outputs: [output('analysis', '私有组合解释', 'portfolio-analysis', 'portfolio-analysis', 'private')], methods: [hybridAi], defaultMethodId: 'hybrid-ai' }),
  node({ id: 'social-report', title: '一页摘要编辑', description: '将已验证结论确定性编辑为公开摘要。', phase: 'report', category: 'report', configurable: false, inputs: [input('overview', '行业总览', 'industry-overview', 'industry-overview'), input('advice', '综合投资结论', 'investment-advice', 'investment-advice'), input('evaluation', '规则复核结果', 'research-evaluation', 'etf-actions')], outputs: [output('report', '一页摘要', 'social-report')], methods: [deterministic], defaultMethodId: 'deterministic' }),
  node({ id: 'generate-report', title: '完整报告归档', description: '汇编完整报告并保存证据、方法、版本和运行审计。', phase: 'report', category: 'report', visibility: 'system', configurable: false, inputs: [input('social', '一页摘要', 'social-report', 'social-report', false), input('portfolio', '私有组合解释', 'portfolio-analysis', 'portfolio-analysis', false, 'portfolio-analysis', 'private'), input('decision', '组合决策支持', 'portfolio-decision-support', 'portfolio-decision', false, 'portfolio-decision-support', 'private'), input('actions', '逐 ETF 决策', 'etf-actions', 'etf-actions'), input('advice', '综合投资结论', 'investment-advice', 'investment-advice')], outputs: [output('reportId', '报告标识', 'report-id'), output('content', '完整报告', 'report-content')], methods: [deterministic], defaultMethodId: 'deterministic', estimatedDuration: 5000 }),
]

const edges: WorkflowEdgeDefinition[] = comprehensiveWorkflowNodes.flatMap(target => target.inputs.map(port => {
  const source = comprehensiveWorkflowNodes.find(candidate => candidate.id === port.sourceNodeId)
  const sourcePort = source?.outputs.find(candidate => candidate.artifactKey === port.artifactKey)
  return {
    id: `${port.sourceNodeId}:${sourcePort?.id || port.artifactKey}->${target.id}:${port.id}`,
    sourceNodeId: port.sourceNodeId!, sourcePortId: sourcePort?.id || port.artifactKey,
    targetNodeId: target.id, targetPortId: port.id, artifactKey: port.artifactKey,
    schemaId: port.schemaId, schemaVersion: port.schemaVersion, required: port.required,
  }
}))

export const comprehensiveWorkflowDefinition: WorkflowDefinition = {
  id: 'comprehensive-analysis', version: '2.0.0', title: '综合投资分析拓扑',
  description: '以冻结证据为起点，由显式输入输出端口连接的可追溯分析链路。',
  phases, nodes: comprehensiveWorkflowNodes, edges,
}

export function validateWorkflowDefinition(definition: WorkflowDefinition) {
  const errors: string[] = []
  const ids = new Set<string>()
  for (const node of definition.nodes) {
    if (ids.has(node.id)) errors.push(`重复节点：${node.id}`)
    ids.add(node.id)
    if (!definition.phases.some(phase => phase.id === node.phase)) errors.push(`节点 ${node.id} 使用未知阶段 ${node.phase}`)
    if (!node.methods.some(method => method.id === node.defaultMethodId)) errors.push(`节点 ${node.id} 的默认方法不存在`)
    for(const dependency of node.executionPolicy?.after||[])if(!definition.nodes.some(candidate=>candidate.id===dependency))errors.push(`节点 ${node.id} 的执行约束引用未知节点 ${dependency}`)
  }
  for (const edge of definition.edges) {
    const source = definition.nodes.find(node => node.id === edge.sourceNodeId)
    const target = definition.nodes.find(node => node.id === edge.targetNodeId)
    const outputPort = source?.outputs.find(port => port.id === edge.sourcePortId)
    const inputPort = target?.inputs.find(port => port.id === edge.targetPortId)
    if (!source || !target || !outputPort || !inputPort) errors.push(`边 ${edge.id} 的节点或端口不存在`)
    else if (outputPort.schemaId !== inputPort.schemaId || outputPort.schemaVersion !== inputPort.schemaVersion) errors.push(`边 ${edge.id} 的 schema 不兼容`)
    if (source?.visibility === 'private' && target?.visibility === 'public') errors.push(`私有数据不能流入公开节点：${edge.id}`)
  }
  const visiting = new Set<string>(), visited = new Set<string>()
  const visit = (id: string) => {
    if (visiting.has(id)) { errors.push(`工作流存在循环：${id}`); return }
    if (visited.has(id)) return
    visiting.add(id)
    definition.edges.filter(edge => edge.sourceNodeId === id).forEach(edge => visit(edge.targetNodeId))
    definition.nodes.filter(node=>node.executionPolicy?.after?.includes(id)).forEach(node=>visit(node.id))
    visiting.delete(id); visited.add(id)
  }
  definition.nodes.forEach(node => visit(node.id))
  return { valid: errors.length === 0, errors }
}

export function normalizeWorkflowNodeConfigs(raw: unknown): Record<string, WorkflowNodeConfig> {
  const inputConfigs = raw && typeof raw === 'object' ? raw as Record<string, unknown> : {}
  return Object.fromEntries(comprehensiveWorkflowDefinition.nodes.map(node => {
    const candidate = inputConfigs[node.id] && typeof inputConfigs[node.id] === 'object' ? inputConfigs[node.id] as Record<string, unknown> : {}
    const method = node.methods.find(item => item.id === candidate.methodId) || node.methods.find(item => item.id === node.defaultMethodId)!
    const supplied = candidate.parameters && typeof candidate.parameters === 'object' ? candidate.parameters as Record<string, unknown> : {}
    const parameters = Object.fromEntries(method.fields.map(field => {
      const value = supplied[field.id] ?? field.defaultValue
      if (field.type === 'number') return [field.id, Math.min(field.max ?? Infinity, Math.max(field.min ?? -Infinity, Number(value) || Number(field.defaultValue)))]
      if (field.type === 'boolean') return [field.id, value === true]
      const allowed = field.options?.map(option => option.value) || []
      return [field.id, allowed.includes(String(value)) ? String(value) : field.defaultValue]
    }))
    return [node.id, { methodId: method.id, parameters }]
  }))
}
