import { etfActionsMarkdown, type ETFAction } from './etf-actions'

const labels: Record<string, string> = {
  analysis: '分析', score: '评分', rating: '评级', thesis: '投资论点', etfImplications: 'ETF影响',
  scenarios: '情景分析', base: '基准情景', bull: '乐观情景', bear: '悲观情景', evidence: '证据',
  claim: '判断', source: '来源', date: '日期', counterEvidence: '反证', risks: '风险', watchlist: '跟踪清单',
  trend: '趋势', risk_level: '风险等级', sentiment: '情绪', catalysts: '催化剂', drivers: '驱动因素',
  stage: '行业阶段', outlook: '展望', key_companies: '重点企业', chain_structure: '产业链结构',
}
function renderValue(value: unknown, depth = 0): string {
  if (value == null) return '未提供'
  if (typeof value === 'string') {
    try { return renderValue(JSON.parse(value.replace(/^```(?:json)?\s*/, '').replace(/\s*```$/, '')), depth) }
    catch { return value }
  }
  if (Array.isArray(value)) return value.length ? value.map(item => `${'  '.repeat(depth)}- ${renderValue(item, depth + 1)}`).join('\n') : '无'
  if (typeof value === 'object') return Object.entries(value).map(([key, item]) => `${'  '.repeat(depth)}- ${labels[key] || key}：${renderValue(item, depth + 1)}`).join('\n')
  return String(value)
}

export function fullResearchMarkdown(input: { title: string; sections: Array<{ title: string; value: unknown }>; actions: ETFAction[]; onePageAvailable: boolean }) {
  const notice = input.onePageAvailable ? '' : '\n\n> 一页发布版暂不可用。以下为已完成的完整研究与ETF操作建议，不受一页模板字数限制。'
  return `# ${input.title}${notice}\n\n` + input.sections.map(section => `## ${section.title}\n\n${renderValue(section.value)}`).join('\n\n') + '\n\n' + etfActionsMarkdown(input.actions)
}
