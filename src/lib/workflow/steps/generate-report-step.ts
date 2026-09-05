import { prisma } from '@/lib/db'
import { fullResearchMarkdown } from '@/lib/analysis/full-research-report'
import { applyContinuityReview, type SocialReport } from '@/lib/analysis/social-report'
import type { StepDefinition } from '../types'

/**
 * 步骤7: 生成综合分析报告
 */
export const generateReportStep: StepDefinition = {
  name: 'generate-report',
  description: '生成综合分析报告',
  dependencies: ['social-report', 'portfolio-analysis', 'etf-actions'],
  estimatedDuration: 5000,

  async execute(context) {
    await context.updateProgress(0, 2, '正在整合分析结果...')

    // 收集所有分析结果
    const industryInfo = context.artifacts.get('industry-info')
    const industryAnalysis = context.artifacts.get('industry-overview')
    const companyAnalysis = context.artifacts.get('company-analysis')
    const sentimentAnalysis = context.artifacts.get('news-analysis')
    const investmentAdvice = context.artifacts.get('investment-advice')
    const etfBindings = (context.artifacts.get('etf-bindings') as any[]) || []

    // 生成报告标题
    const title = `${industryInfo?.name || '行业'} - ${context.input.rulesOnly?'规则复核':'综合投资分析'}报告`

    // 构建Markdown格式报告
    const draft = context.artifacts.get('social-report') as SocialReport | null | undefined
    const social = draft ? applyContinuityReview(draft, context.artifacts.get('data-quality')) : null
    await context.saveArtifact('public-report-validation', { continuityGuard: true, validatedReport: social }, 'DATA')
    const actions = context.artifacts.get('etf-actions') || []
    const reportContent = fullResearchMarkdown({ title, onePageAvailable: !!social, actions, sections: [
      { title: '市场分析', value: context.artifacts.get('market-analysis') },
      { title: '产业资讯分析', value: sentimentAnalysis },
      { title: '产业链企业分析', value: companyAnalysis },
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
        summary: context.input.rulesOnly?'本地规则复核已完成，未调用AI；请查看条件变化与证据。':social?.subtitle || '完整研究与ETF操作建议已生成；一页发布版暂不可用。',
        content: reportContent,
        dataJson: JSON.stringify({
          socialReport: social,
          socialReportStatus: context.artifacts.get('social-report-status'),
          etfActions: actions,
          researchEvaluation: context.artifacts.get('research-evaluation'),
          researchManifest: context.artifacts.get('research-manifest'),
          researchPreflight: context.artifacts.get('research-preflight'),
          dataQuality: context.artifacts.get('data-quality'),
          privatePortfolioAnalysis: context.artifacts.get('portfolio-analysis'),
          marketSnapshot: context.artifacts.get('market-snapshot'),
          marketAnalysis: context.artifacts.get('market-analysis'),
          industryAnalysis,
          companyAnalysis,
          sentimentAnalysis,
          investmentAdvice,
          etfBindings,
          metadata: {
            runId: context.runId,
            parentRunId: context.input.parentRunId || null,
            kind: context.input.parentRunId ? 'review' : 'analysis',
            generatedAt: new Date().toISOString()
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
