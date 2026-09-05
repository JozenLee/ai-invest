export const REPORT_SECTIONS = ['产业驱动', '盈利质量', '市场与估值', 'ETF映射', '情景与反证', '跟踪清单'] as const
export type ReportMetric = { label: string; value: string; source: string; date: string }
export type SocialReport = { version?: 2; metrics?: ReportMetric[]; title: string; subtitle: string; takeaways: string[]; sections: Array<{ title: string; body: string }>; risks: string[] }
export class SocialReportValidationError extends Error {
  constructor(public readonly issues: string[]) {
    super('一页报告校验失败：' + issues.join('；'))
    this.name = 'SocialReportValidationError'
  }
}
export function applyContinuityReview(report: SocialReport, quality: { adjustmentWarnings?: unknown[]; continuityReview?: { affectedEtfs?: unknown[] } } | null | undefined): SocialReport {
  const count = quality?.continuityReview?.affectedEtfs?.length || quality?.adjustmentWarnings?.length || 0
  if (!count) return report
  const sections = report.sections.map(section => /技术面|均线|RSI|MACD|最大回撤|历史波动率/i.test(section.title + section.body)
    ? { title: report.version === 2 ? section.title : '数据核验：技术指标暂缓使用', body: `复核发现${count}只ETF存在超过30%的单日价格断点，原因未核实。跨断点均线、RSI、波动率和回撤暂停使用，不据此判断超卖或反转；先核验复权与价格连续性。` }
    : section)
  return { ...report, sections: [...new Map(sections.map(section => [section.title + '\n' + section.body, section])).values()] }
}
export function parseSocialReport(text: string): SocialReport {
  let value
  try { value = JSON.parse(text.trim().replace(/^```(?:json)?\s*/, '').replace(/\s*```$/, '')) }
  catch { throw new SocialReportValidationError(['response：不是有效JSON对象']) }
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new SocialReportValidationError(['response：必须是JSON对象'])
  const issues: string[] = []
  const checkText = (s: unknown, path: string, max = Infinity) => {
    if (typeof s !== 'string' || !s.trim()) issues.push(`${path}：必须是非空字符串`)
    else if (Array.from(s).length > max) issues.push(`${path}：实际${Array.from(s).length}字，最多${max}字`)
  }
  checkText(value.title, 'title', value.version === 2 ? 20 : Infinity)
  checkText(value.subtitle, 'subtitle', value.version === 2 ? 80 : Infinity)
  for (const key of ['takeaways', 'risks'] as const) {
    const rows = value[key]
    if (!Array.isArray(rows)) issues.push(`${key}：必须是数组`)
    else {
      if (value.version === 2 && rows.length !== 3) issues.push(`${key}：实际${rows.length}条，必须恰好3条`)
      if (key === 'risks' && !rows.length) issues.push('risks：至少需要1条风险')
      rows.forEach((row: unknown, i: number) => checkText(row, `${key}[${i}]`, value.version === 2 ? (key === 'takeaways' ? 40 : 55) : Infinity))
    }
  }
  if (!Array.isArray(value.sections)) issues.push('sections：必须是数组')
  else {
    if (value.version === 2 ? value.sections.length !== 6 : value.sections.length < 3) issues.push(`sections：实际${value.sections.length}节，要求${value.version === 2 ? '恰好6' : '至少3'}节`)
    value.sections.forEach((section: {title?: unknown; body?: unknown} | null, i: number) => {
      checkText(section?.title, `sections[${i}].title`)
      checkText(section?.body, `sections[${i}].body`, value.version === 2 ? 120 : Infinity)
      if (value.version === 2 && section?.title !== REPORT_SECTIONS[i]) issues.push(`sections[${i}].title：应为「${REPORT_SECTIONS[i] || '不应有额外章节'}」，实际「${section?.title}」`)
    })
  }
  if (issues.length) throw new SocialReportValidationError(issues)
  const metrics = Array.isArray(value.metrics) ? value.metrics.filter((m: Record<string, unknown> | null) => ['label','value','source','date'].every(key => typeof m?.[key] === 'string' && (m[key] as string).trim())) : undefined
  return { ...(value.version === 2 ? { version: 2 as const } : {}), ...(metrics ? {metrics} : {}), title: value.title, subtitle: value.subtitle, takeaways: value.takeaways, sections: value.sections, risks: value.risks }
}
function fitText(value: unknown, max: number) {
  if (typeof value !== 'string') return value
  const chars=Array.from(value.trim())
  if(chars.length<=max)return value.trim()
  const draft=chars.slice(0,Math.max(1,max-1)).join('')
  const sentence=Math.max(draft.lastIndexOf('。'),draft.lastIndexOf('；'),draft.lastIndexOf('！'),draft.lastIndexOf('？'))
  const safe=sentence>=Math.floor(max*.55)?draft.slice(0,sentence+1):draft.replace(/[A-Za-z0-9_.:/-]+$/u,'').replace(/[\s，,、；;：:。.!！?？]+$/u,'')
  return safe+'…'
}
/** Last-resort layout repair. It only removes trailing model prose; structural
 * validation still runs afterwards, so missing sections or malformed content
 * can never be promoted to a publishable report. */
export function compactSocialReport(text: string): SocialReport {
  let value: Record<string, unknown>
  try { value=JSON.parse(text.trim().replace(/^```(?:json)?\s*/, '').replace(/\s*```$/, '')) }
  catch { return parseSocialReport(text) }
  if(value.version!==2)return parseSocialReport(text)
  const sections=Array.isArray(value.sections)?value.sections.map(section=>section&&typeof section==='object'?{...section,body:fitText((section as {body?:unknown}).body,120)}:section):value.sections
  const takeaways=Array.isArray(value.takeaways)?value.takeaways.map(row=>fitText(row,40)):value.takeaways
  const risks=Array.isArray(value.risks)?value.risks.map(row=>fitText(row,55)):value.risks
  return parseSocialReport(JSON.stringify({...value,title:fitText(value.title,20),subtitle:fitText(value.subtitle,80),takeaways,sections,risks}))
}
export function socialMarkdown(report: SocialReport) {
  const metrics = report.metrics?.length ? '\n\n## 关键指标\n\n' + report.metrics.map(m => `- ${m.label}：${m.value}（${m.date}，${m.source}）`).join('\n') : ''
  return `# ${report.title}\n\n${report.subtitle}${metrics}\n\n## 一分钟看懂\n\n${report.takeaways.map(row => '- ' + row).join('\n')}\n\n${report.sections.map(row => '## ' + row.title + '\n\n' + row.body).join('\n\n')}\n\n## 风险与边界\n\n${report.risks.map(row => '- ' + row).join('\n')}\n\n仅供研究交流，不构成投资建议。`
}
