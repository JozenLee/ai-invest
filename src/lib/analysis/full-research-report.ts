import { etfActionsMarkdown, type ETFAction } from './etf-actions'
import type { DecisionTimingAssessment } from './decision-timing'

const labels: Record<string, string> = {
  dimensions: '分析维度', name: '名称', judgment: '判断', detail: '依据', dataBoundary: '数据边界', referenceIssues: '引用问题',
  analysis: '分析', score: '评分', rating: '评级', executiveSummary: '综合投资结论', conclusion: '综合判断',
  allocationStance: '配置立场', keyDrivers: '关键驱动', opportunities: '机会与兑现状态', mainRisks: '主要风险', watchPoints: '重点关注', actionPlan: '建议操作', priority: '操作优先级', historyComparison: '历史机会验证', reviewTriggers: '复核触发项',
  thesis: '投资论点', etfImplications: 'ETF影响', productDecisions:'AI逐产品投资决策',
  unheldAction:'未持有动作',heldAction:'已持有动作',suggestedAdjustmentPct:'AI建议单日调整百分点',confidencePct:'AI置信度',trigger:'触发条件',invalidation:'失效条件',evidenceIds:'证据编号',decisionSource:'决策来源',recommendationSource:'观点与约束来源',
  scenarios: '情景分析', base: '基准情景', bull: '乐观情景', bear: '悲观情景', evidence: '证据',
  claim: '判断', source: '来源', date: '日期', counterEvidence: '反证', risks: '风险', watchlist: '跟踪清单',
  trend: '趋势', risk_level: '风险等级', sentiment: '情绪', catalysts: '催化剂', drivers: '驱动因素',
  stage: '行业阶段', outlook: '展望', key_companies: '重点企业', chain_structure: '产业链结构',
  revisions: '版本', structureRevisionId: '图谱结构版本', structureVersion: '图谱结构序号', structureContentHash: '图谱结构哈希',
  mappingRevisionId: '企业与ETF匹配版本', mappingContentHash: '企业与ETF匹配哈希', mappingPublishedAt: '匹配发布时间', sourceFetchedAt: '冻结数据获取时间',
  coverage: '覆盖度', stages: '产业阶段', segments: '细分环节', matchedEtfs: '匹配ETF', matchedIndices: '匹配指数',
  companies: '企业数量', relations: '传导关系数量', evidencedRelations: '有证据关系数', relationEvidencePct: '关系证据覆盖率',
  segmentEtfCoveragePct: '环节ETF覆盖率', segmentIndexCoveragePct: '环节指数覆盖率', companySegmentCoveragePct: '企业环节归属率',
  companyEtfCoveragePct: '企业ETF映射率', holdingVerifiedCoveragePct: '持仓验证覆盖率',
  representativeCompanies: '代表企业', representativeEtfs: '企业对应ETF', representativeIndices: '企业对应指数',
  etfExposure: 'ETF产业暴露', eventPropagation: '事件传导路径', mappingStatus: '匹配完整性', limitation: '使用边界',
  matchSource: '匹配来源', matchConfidence: '匹配置信度', representativenessScore: '产业代表性', selectionReason: '选择理由',
}
export function renderValue(value: unknown, depth = 0): string {
  if (value == null) return '未提供'
  if (typeof value === 'string') {
    try { return renderValue(JSON.parse(value.replace(/^```(?:json)?\s*/, '').replace(/\s*```$/, '')), depth) }
    catch { return value }
  }
  const nested=(item:unknown)=>item!==null&&typeof item==='object'
  const indent='  '.repeat(depth)
  if(Array.isArray(value))return value.length?value.map((item,index)=>nested(item)?`${indent}- 第${index+1}项\n${renderValue(item,depth+1)}`:`${indent}- ${renderValue(item)}`).join('\n'):'无'
  if(typeof value==='object')return Object.entries(value).filter(([key,item])=>item!==undefined&&!(key==='referenceIssues'&&Array.isArray(item)&&!item.length)).map(([key,item])=>nested(item)?`${indent}- ${labels[key]||key}：\n${renderValue(item,depth+1)}`:`${indent}- ${labels[key]||key}：${renderValue(item)}`).join('\n')
  return String(value)
}

export function fullResearchMarkdown(input: { title: string; sections: Array<{ title: string; value: unknown }>; actions: ETFAction[]; onePageAvailable: boolean; decisionTiming?: DecisionTimingAssessment; executiveConclusion?: string; executionSummary?: string }) {
  const notice = input.onePageAvailable ? '' : '\n\n> 一页发布版暂不可用。以下为已完成的完整研究与ETF操作建议，不受一页模板字数限制。'
  const timing = input.decisionTiming
  const timingNotice = timing ? `\n\n> **${timing.label}**：${timing.basis}\n> 冻结时点：${timing.asOf}；最近完整收盘日：${timing.closeDataSession || '未核验'}；事件截点：${timing.eventCutoff}。` : '\n\n> **数据口径未记录**：旧报告没有保存行情数据口径。'
  const conclusion=input.executiveConclusion?`\n\n## 综合结论\n\n${input.executiveConclusion}\n\n${input.executionSummary||''}`:''
  return `# ${input.title}${notice}${timingNotice}${conclusion}\n\n` + input.sections.map(section => `## ${section.title}\n\n${renderValue(section.value)}`).join('\n\n') + '\n\n' + etfActionsMarkdown(input.actions)
}
