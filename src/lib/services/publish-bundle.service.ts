/* eslint-disable @typescript-eslint/no-explicit-any -- Persisted report payloads are runtime-normalized legacy JSON. */
import { mkdir } from 'node:fs/promises'
import path from 'node:path'
import sharp from 'sharp'
import { prisma } from '@/lib/db'
import { aiClient } from '@/lib/ai/ai-factory'
import { reportAdviceConfidence } from '@/lib/analysis/report-insights'
import { normalizeSocialReport, parseSocialReport, type SocialReport } from '@/lib/analysis/social-report'
import { renderReportPoster } from '@/lib/analysis/report-poster'

type SourceItem = {
  reportId: string
  industryId: string
  industryName: string
  title: string
  conclusion: string
  takeaways: string[]
  risks: string[]
  confidencePct: number
  createdAt: string
  poster: SocialReport
}

export type PublishBundle = {
  reportIds: string[]
  title: string
  content: string
  items: SourceItem[]
  fusion: { title: string; summary: string; takeaways: string[]; allocationView: string; watchPoints: string[]; risks: string[]; confidencePct: number; poster: SocialReport }
  generation: 'ai' | 'deterministic-fallback'
}

const chars = (value: string, max: number) => Array.from(String(value || '').replace(/\s+/g, ' ').trim()).slice(0, max).join('')
const sentence = (value: string, fallback: string) => value.replace(/\s+/g, ' ').split(/(?<=[。！？；])/u).find(Boolean)?.trim() || fallback
const object = (value: unknown): Record<string, any> => {
  if (value && typeof value === 'object' && !Array.isArray(value)) return value as Record<string, any>
  try { const parsed = JSON.parse(String(value || '{}')); return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {} } catch { return {} }
}

function parseAiJson(value: string) {
  const clean = value.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '')
  try { return object(JSON.parse(clean)) } catch {
    const start = clean.indexOf('{'), end = clean.lastIndexOf('}')
    return start >= 0 && end > start ? object(JSON.parse(clean.slice(start, end + 1))) : {}
  }
}

function sourcePoster(industryName: string, social: SocialReport, conclusion: string, confidencePct: number): SocialReport {
  const takeaways = [
    ...social.takeaways,
    `建议置信度：${confidencePct}%。`,
  ].map(item => chars(item, 52)).filter(Boolean).slice(0, 3)
  while (takeaways.length < 3) takeaways.push('结论已由冻结证据与规则交叉复核。')
  return {
    title: chars(`${industryName}综合结论`, 20),
    subtitle: chars(conclusion || social.subtitle, 110),
    takeaways,
    sections: social.sections.slice(0, 3).map(section => ({ title: section.title, body: chars(section.body, 150) })),
    risks: social.risks.map(item => chars(item, 70)).slice(0, 3),
    metrics: social.metrics?.slice(0, 3),
  }
}

async function loadSources(reportIds: string[]): Promise<SourceItem[]> {
  const unique = [...new Set(reportIds.filter(Boolean))]
  if (!unique.length || unique.length > 8) throw new Error('请选择 1–8 个产业')
  const rows = await prisma.aIAnalysisReport.findMany({ where: { id: { in: unique } } })
  const byId = new Map(rows.map(row => [row.id, row]))
  return unique.map(reportId => {
    const report = byId.get(reportId)
    if (!report || report.type !== 'comprehensive') throw new Error('所选报告不存在或不是综合分析报告')
    const data = object(report.dataJson)
    if (!data.metadata?.runId || !data.socialReport) throw new Error(`${report.industryName}尚未生成可发布的综合结论`)
    const social = normalizeSocialReport(parseSocialReport(JSON.stringify(data.socialReport)), data.researchEvaluation, data.companyAnalysis)
    const advice = object(data.investmentAdvice)
    const executive = object(advice.executiveSummary)
    const conclusion = chars(String(executive.conclusion || advice.thesis || report.summary || social.subtitle), 260)
    const confidencePct = reportAdviceConfidence(data.researchEvaluation, data.dataQuality)
    return {
      reportId, industryId: report.industryId, industryName: report.industryName,
      title: social.title, conclusion, takeaways: social.takeaways, risks: social.risks,
      confidencePct, createdAt: report.createdAt.toISOString(),
      poster: sourcePoster(report.industryName, social, conclusion, confidencePct),
    }
  })
}

function fallbackFusion(items: SourceItem[]) {
  const names = items.map(item => item.industryName)
  const avg = Math.round(items.reduce((sum, item) => sum + item.confidencePct, 0) / items.length)
  const takeaways = items.slice(0, 3).map(item => chars(`${item.industryName}：${sentence(item.conclusion, item.takeaways[0] || '综合结论待复核')}`, 64))
  while (takeaways.length < 3) takeaways.push('多产业结论仅共享组合风险预算，不共享个人持仓数据。')
  const risks = [...new Set(items.flatMap(item => item.risks))].slice(0, 3).map(item => chars(item, 70))
  while (risks.length < 3) risks.push('行业间相关性与市场环境变化可能使结论同时失效。')
  return {
    title: chars(names.length === 1 ? `${names[0]}投资观察` : `${names.slice(0, 2).join('×')}投资观察`, 20),
    summary: `${names.join('、')}共 ${items.length} 个产业已完成同一时点的分层分析，综合置信度 ${avg}%。`,
    takeaways,
    allocationView: '先遵守现金底仓、单基金上限与产业预算；只对产品映射和成本完整的基金生成金额。',
    watchPoints: items.map(item => `${item.industryName}：${item.takeaways.at(-1) || '跟踪下一交易日验证'}`).slice(0, 3),
    risks, confidencePct: avg,
  }
}

async function aiFusion(items: SourceItem[]) {
  const fallback = fallbackFusion(items)
  const facts = items.map(item => ({ industry:item.industryName, conclusion:item.conclusion, takeaways:item.takeaways, risks:item.risks, confidencePct:item.confidencePct, reportId:item.reportId }))
  try {
    const response = await aiClient.complete({
      system: '你是投资研究编辑。只能融合输入中已有结论，不得增加事实、收益预测、个股推荐或个人持仓。区分共识与分歧，并保留风险边界。只输出 JSON。',
      prompt: `融合以下产业综合结论：${JSON.stringify(facts)}\n返回：{"title":"20字内","summary":"100字内","takeaways":["共3条，每条60字内"],"allocationView":"100字内，仅表述跨产业风险预算思路","watchPoints":["共3条，每条60字内"],"risks":["共3条，每条70字内"]}`,
      maxTokens: 1800, timeoutMs: 120_000,
    })
    const value = parseAiJson(response)
    const takeaways = Array.isArray(value.takeaways) ? value.takeaways.map(String).filter(Boolean).slice(0, 3) : []
    const watchPoints = Array.isArray(value.watchPoints) ? value.watchPoints.map(String).filter(Boolean).slice(0, 3) : []
    const risks = Array.isArray(value.risks) ? value.risks.map(String).filter(Boolean).slice(0, 3) : []
    if (!value.title || !value.summary || !value.allocationView || takeaways.length !== 3 || watchPoints.length !== 3 || risks.length !== 3) throw new Error('AI融合输出不完整')
    return [{ title:chars(String(value.title),20),summary:chars(String(value.summary),120),takeaways:takeaways.map(item=>chars(item,64)),allocationView:chars(String(value.allocationView),120),watchPoints:watchPoints.map(item=>chars(item,64)),risks:risks.map(item=>chars(item,75)),confidencePct:fallback.confidencePct }, 'ai' as const] as const
  } catch (error) {
    console.warn('多产业结论 AI 融合失败，使用确定性编辑结果:', error)
    return [fallback, 'deterministic-fallback' as const] as const
  }
}

export async function buildPublishBundle(reportIds: string[]): Promise<PublishBundle> {
  const items = await loadSources(reportIds)
  const [fusion, generation] = await aiFusion(items)
  const poster: SocialReport = {
    title: fusion.title,
    subtitle: fusion.summary,
    takeaways: fusion.takeaways,
    sections: [
      { title:'跨产业配置视角', body:fusion.allocationView },
      { title:'关键验证点', body:fusion.watchPoints.join('；') },
      { title:'结论来源', body:`基于 ${items.map(item=>item.industryName).join('、')} 共 ${items.length} 份最新综合分析报告。` },
    ],
    risks: fusion.risks,
  }
  const body=`${fusion.summary}\n\n${fusion.takeaways.map(item=>`· ${item}`).join('\n')}\n\n配置视角：${fusion.allocationView}\n\n跟踪清单：${fusion.watchPoints.join('；')}\n\n风险提示：${fusion.risks.join('；')}\n\n仅供研究交流，不构成投资建议。`
  const content=Array.from(body.trim()).slice(0,980).join('')
  return { reportIds:items.map(item=>item.reportId),title:fusion.title,content,items,fusion:{...fusion,poster},generation }
}

export async function renderPublishBundleImages(bundle: PublishBundle, outputDirectory?: string) {
  if (outputDirectory) await mkdir(outputDirectory,{recursive:true})
  const date = new Date().toISOString().slice(0,10)
  const posters = [...bundle.items.map(item => ({ key:item.industryId, industry:item.industryName, report:item.poster })),{ key:'fusion',industry:'多产业投资观察',report:bundle.fusion.poster }]
  return Promise.all(posters.map(async (item,index) => {
    const png = await sharp(Buffer.from(renderReportPoster(item.report,{industry:item.industry,date}))).png().toBuffer()
    if (!outputDirectory) return `data:image/png;base64,${png.toString('base64')}`
    const filePath=path.join(outputDirectory,`${String(index+1).padStart(2,'0')}-${item.key}.png`)
    await sharp(png).toFile(filePath)
    return filePath
  }))
}
