import { prisma } from '@/lib/db'
import { fullResearchMarkdown } from '@/lib/analysis/full-research-report'
import { applyContinuityReview, type SocialReport } from '@/lib/analysis/social-report'
import { buildReportQuality, buildReportReviewDelta } from '@/lib/analysis/report-quality'
import type { Evaluation } from '@/lib/research/contracts'
import { effectiveDecisionTiming, finalizeDecisionTiming, type DecisionTimingAssessment } from '@/lib/analysis/decision-timing'
import { applyDecisionTimingGate } from '@/lib/portfolio/decision-support'
import type { StepDefinition } from '../types'

type ArchivedReportData = {
  socialReport?: SocialReport | null
  researchEvaluation?: Evaluation
  marketAnalysis?: unknown
  industryAnalysis?: unknown
  companyAnalysis?: unknown
  sentimentAnalysis?: unknown
  investmentAdvice?: unknown
  metadata?: { runId?: string; parentRunId?: string | null; kind?: string }
}

const parseArchivedData = (value: string | null): ArchivedReportData => {
  try { return value ? JSON.parse(value) as ArchivedReportData : {} } catch { return {} }
}

async function reportForRun(runId: string) {
  return prisma.aIAnalysisReport.findFirst({
    where: { type: 'comprehensive', dataJson: { contains: `\"runId\":\"${runId}\"` } },
    orderBy: { createdAt: 'desc' },
  })
}

/** Review reports compare with their direct parent but inherit narrative from the
 * nearest full analysis. This keeps the latest report readable without presenting
 * the inherited AI prose as newly generated. */
async function reviewLineage(parentRunId?: string | null) {
  if (!parentRunId) return { parent: null, narrative: null }
  const parent = await reportForRun(parentRunId)
  let narrative = parent
  let data = parseArchivedData(narrative?.dataJson || null)
  const visited = new Set<string>()
  while (narrative && data.metadata?.kind === 'review' && data.metadata.parentRunId && !visited.has(data.metadata.parentRunId)) {
    visited.add(data.metadata.parentRunId)
    const next = await reportForRun(data.metadata.parentRunId)
    if (!next) break
    narrative = next
    data = parseArchivedData(next.dataJson)
  }
  return { parent, narrative }
}

/**
 * 步骤7: 生成综合分析报告
 */
export const generateReportStep: StepDefinition = {
  name: 'generate-report',
  description: '生成综合分析报告',
  dependencies: ['social-report', 'portfolio-analysis', 'portfolio-decision', 'etf-actions'],
  estimatedDuration: 5000,

  async execute(context) {
    await context.updateProgress(0, 2, '正在整合分析结果...')

    // 收集所有分析结果
    const industryInfo = context.artifacts.get('industry-info')
    const lineage = context.input.rulesOnly ? await reviewLineage(context.input.parentRunId) : { parent: null, narrative: null }
    const parentData = parseArchivedData(lineage.parent?.dataJson || null)
    const inheritedData = parseArchivedData(lineage.narrative?.dataJson || null)
    const industryAnalysis = context.input.rulesOnly ? inheritedData.industryAnalysis : context.artifacts.get('industry-overview')
    const companyAnalysis = context.input.rulesOnly ? inheritedData.companyAnalysis : context.artifacts.get('company-analysis')
    const sentimentAnalysis = context.input.rulesOnly ? inheritedData.sentimentAnalysis : context.artifacts.get('news-analysis')
    const investmentAdvice = context.input.rulesOnly ? inheritedData.investmentAdvice : context.artifacts.get('investment-advice')
    const marketAnalysis = context.input.rulesOnly ? inheritedData.marketAnalysis : context.artifacts.get('market-analysis')
    const etfBindings = (context.artifacts.get('etf-bindings') as Array<Record<string, unknown>> | undefined) || []
    const evaluation = context.artifacts.get('research-evaluation') as Evaluation | undefined
    const validation = context.artifacts.get('portfolio-decision-validation')
    const dataQuality = context.artifacts.get('data-quality')
    const researchPreflight = context.artifacts.get('research-preflight')
    const graphContext = context.artifacts.get('graph-context') || context.artifacts.get('research-snapshot')?.graphContext
    const graphReportSection = graphContext ? {
      revisionId: graphContext.revisionId,
      version: graphContext.version,
      contentHash: graphContext.contentHash,
      sourceFetchedAt: graphContext.sourceFetchedAt,
      coverage: graphContext.coverage,
      stages: (graphContext.stages || []).map((stage: any) => ({ name: stage.name, segments: (stage.segments || []).map((segment: any) => segment.name) })),
      eventPropagation: (graphContext.eventMappings || []).slice(0, 8),
      limitation: '图谱关系用于界定产业范围和构造传导假设，不单独构成ETF交易信号。',
    } : null
    const generatedAt = new Date().toISOString()
    const frozenTiming = context.artifacts.get('decision-timing') as DecisionTimingAssessment | undefined
    const decisionTiming = frozenTiming ? finalizeDecisionTiming(frozenTiming, generatedAt) : effectiveDecisionTiming(undefined, generatedAt)
    const portfolioDecisionSupport = applyDecisionTimingGate(context.artifacts.get('portfolio-decision-support'), decisionTiming)
    const reportQuality = buildReportQuality({ evaluation, validation, dataQuality, preflight: researchPreflight, decisionTiming })
    const reviewDelta = context.input.rulesOnly ? buildReportReviewDelta({
      current: evaluation,
      previous: parentData.researchEvaluation,
      parentRunId: context.input.parentRunId,
      baselineReportId: lineage.parent?.id || null,
    }) : null

    // 生成报告标题
    const title = `${industryInfo?.name || '行业'} - ${context.input.rulesOnly?'规则复核':'综合投资分析'}报告`

    // 构建Markdown格式报告
    const generatedDraft = context.artifacts.get('social-report') as SocialReport | null | undefined
    const draft = context.input.rulesOnly ? inheritedData.socialReport : generatedDraft
    const social = draft ? applyContinuityReview(draft, context.artifacts.get('data-quality')) : null
    await context.saveArtifact('public-report-validation', { continuityGuard: true, validatedReport: social }, 'DATA')
    const actions = context.artifacts.get('etf-actions') || []
    const reportContent = fullResearchMarkdown({ title, onePageAvailable: !!social, actions, decisionTiming, sections: [
      { title: '市场分析', value: marketAnalysis },
      { title: '产业资讯分析', value: sentimentAnalysis },
      { title: '产业链企业分析', value: companyAnalysis },
      { title: '产业认知基线与传导', value: graphReportSection },
      { title: '行业总览', value: industryAnalysis },
      { title: '投资建议与反证', value: investmentAdvice },
    ] })

    await context.updateProgress(1, 2, '正在保存报告...')

    // 保存到数据库
    const data = {
        type: 'comprehensive',
        industryId: industryInfo.id,
        industryName: industryInfo.name,
        title: social?.title || title,
        summary: `${decisionTiming.executionReady ? '盘中执行时效已通过。' : `仅供投资参考：${decisionTiming.reasons[0] || '未通过盘中执行时效'}。`} ${context.input.rulesOnly
          ? `${reviewDelta?.summary || '本地规则复核已完成。'}${lineage.narrative ? ` 正文继承自${lineage.narrative.createdAt.toISOString()}的完整分析，本轮未重新调用AI。` : ''}`
          : social?.subtitle || '完整研究与ETF操作建议已生成；一页发布版暂不可用。'}`,
        content: reportContent,
        dataJson: JSON.stringify({
          socialReport: social,
          socialReportStatus: context.artifacts.get('social-report-status'),
          etfActions: actions,
          researchEvaluation: evaluation,
          researchManifest: context.artifacts.get('research-manifest'),
          graphContext,
          researchPreflight,
          dataQuality,
          reportQuality,
          decisionTiming,
          reviewDelta,
          historicalReportContext: context.artifacts.get('historical-report-context') || [],
          historicalReportPolicy: context.artifacts.get('historical-report-policy') || null,
          inheritedFromReportId: context.input.rulesOnly ? lineage.narrative?.id || null : null,
          privatePortfolioAnalysis: context.artifacts.get('portfolio-analysis'),
          portfolioDecisionSupport,
          portfolioDecisionValidation: context.artifacts.get('portfolio-decision-validation'),
          marketSnapshot: context.artifacts.get('market-snapshot'),
          marketAnalysis,
          industryAnalysis,
          companyAnalysis,
          sentimentAnalysis,
          investmentAdvice,
          etfBindings,
          metadata: {
            runId: context.runId,
            parentRunId: context.input.parentRunId || null,
            kind: context.input.parentRunId ? 'review' : 'analysis',
            generatedAt,
            graphRevisionId: graphContext?.revisionId || null
          }
        })
      }
    // Recover from a save succeeding before the worker could persist report-id.
    const existing = await prisma.aIAnalysisReport.findFirst({ where: { type: 'comprehensive', dataJson: { contains: JSON.stringify({ runId: context.runId }).slice(1, -1) } } })
    const report = existing
      ? await prisma.aIAnalysisReport.update({ where: { id: existing.id }, data })
      : await prisma.aIAnalysisReport.create({ data })

    await context.updateProgress(2, 2, '报告生成完成')

    // 保存报告ID
    await context.saveArtifact('report-id', report.id, 'REFERENCE')
    await context.saveArtifact('report-content', reportContent, 'DATA')
  }
}
