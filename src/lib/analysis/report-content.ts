import { cleanAdviceText } from './report-contract'

export function normalizeComprehensiveReportContent(content: string, data: unknown) {
  if (!data || typeof data !== 'object') return content
  const advice = (data as { advice?: Record<string, unknown> }).advice
  if (!advice) return content
  const summary = cleanAdviceText(typeof advice.summary === 'string' ? advice.summary : '')
  const strategy = cleanAdviceText(typeof advice.strategy === 'string' ? advice.strategy : '')
  if (!summary && !strategy) return content
  const sections = [
    '## 核心结论与投资策略',
    summary ? `📌 核心判断：${summary.replace(/[。！？]+$/u, '')}。` : '',
    strategy ? `🧭 投资策略：${strategy.replace(/[。！？]+$/u, '')}。` : '',
  ].filter(Boolean).join('\n\n')
  return content.replace(/## 核心结论与投资策略[\s\S]*?(?=\n## 执行动作)/u, `${sections}\n`)
}
