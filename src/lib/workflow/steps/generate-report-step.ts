import { researchCitationSources } from '../research-output'
import { buildOpportunityLedger, type ResearchOpportunity } from '@/lib/analysis/opportunity-ledger'
import { auditResearchConsistency } from '@/lib/analysis/research-consistency'
import { enrichCatalysts } from '@/lib/analysis/disclosed-exposure'
import { prisma } from '@/lib/db'
import { fullResearchMarkdown } from '@/lib/analysis/full-research-report'
import { applyContinuityReview, normalizeSocialReport, type SocialReport } from '@/lib/analysis/social-report'
import { buildReportQuality, buildReportReviewDelta } from '@/lib/analysis/report-quality'
import type { Evaluation } from '@/lib/research/contracts'
import { effectiveDecisionTiming, finalizeDecisionTiming, type DecisionTimingAssessment } from '@/lib/analysis/decision-timing'
import { applyDecisionTimingGate } from '@/lib/portfolio/decision-support'
import { auditEvidenceTree } from '@/lib/analysis/evidence-references'
import type { FrozenGraphContext } from '@/lib/graph/research-context'
import type { StepDefinition } from '../types'
import { refreshEventPaths } from '../event-paths'
import { auditReportFacts, buildResearchFactRegistry } from '@/lib/analysis/fact-audit'
import { withDatabaseBusyRetry } from '@/lib/db/retry'

type ArchivedReportData = {
  opportunityLedger?: ResearchOpportunity[]
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

const record = (value: unknown): Record<string, unknown> => {
  if (value && typeof value === 'object' && !Array.isArray(value)) return value as Record<string, unknown>
  try {
    const parsed = JSON.parse(String(value || '{}'))
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed as Record<string, unknown> : {}
  } catch { return {} }
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
  dependencies: ['social-report', 'portfolio-decision', 'assess-data-quality'],
  estimatedDuration: 5000,

  async execute(context) {
    await context.updateProgress(0, 2, '正在整合分析结果...')

    // 收集所有分析结果
    const industryInfo = context.artifacts.get('industry-info')
    const lineage = context.input.rulesOnly ? await reviewLineage(context.input.parentRunId) : { parent: null, narrative: null }
    const parentData = parseArchivedData(lineage.parent?.dataJson || null)
    const inheritedData = parseArchivedData(lineage.narrative?.dataJson || null)
    const evidenceSources=researchCitationSources(context)
    const industryAnalysis = auditEvidenceTree(context.input.rulesOnly ? inheritedData.industryAnalysis : context.artifacts.get('industry-overview'),evidenceSources)
    const companyAnalysis = auditEvidenceTree(context.input.rulesOnly ? inheritedData.companyAnalysis : context.artifacts.get('company-analysis'),evidenceSources)
    const inheritedSentiment = context.input.rulesOnly ? inheritedData.sentimentAnalysis : context.artifacts.get('news-analysis')
    let investmentAdvice = auditEvidenceTree(context.input.rulesOnly ? inheritedData.investmentAdvice : context.artifacts.get('investment-advice'),evidenceSources)
    const investmentRecord = record(investmentAdvice)
    const executiveSummary = record(investmentRecord.executiveSummary)
    const executiveConclusion = String(executiveSummary.conclusion || investmentRecord.thesis || '').replace(/\s+/g, ' ').trim()
    const marketAnalysis = auditEvidenceTree(context.input.rulesOnly ? inheritedData.marketAnalysis : context.artifacts.get('market-analysis'),evidenceSources)
    const etfBindings = (context.artifacts.get('etf-bindings') as Array<Record<string, unknown>> | undefined) || []
    const frozenEvaluation = context.artifacts.get('research-evaluation') as Evaluation | undefined
    const evaluation = frozenEvaluation?{...frozenEvaluation,evidence:evidenceSources}:undefined
    const dataQuality = context.artifacts.get('data-quality')
    const researchPreflight = context.artifacts.get('research-preflight')
    const graphContext = (context.artifacts.get('graph-context') || context.artifacts.get('research-snapshot')?.graphContext) as FrozenGraphContext | undefined
    const graphMappingValidation = context.artifacts.get('graph-mapping-validation')
    const sentimentAnalysis = auditEvidenceTree(enrichCatalysts(record(refreshEventPaths(enrichCatalysts(record(inheritedSentiment),context.artifacts.get('etf-holdings'),context.artifacts.get('research-snapshot')?.companies),graphContext)),context.artifacts.get('etf-holdings'),context.artifacts.get('research-snapshot')?.companies),evidenceSources)
    const graphReportSection = graphContext ? {
      revisions: {
        structureRevisionId: graphContext.revisionId,
        structureVersion: graphContext.version,
        structureContentHash: graphContext.contentHash,
        mappingRevisionId: graphContext.mappingRevisionId,
        mappingContentHash: graphContext.mappingContentHash,
        mappingPublishedAt: graphContext.mappingPublishedAt,
        mappingSource: graphContext.mappingSource,
        sourceFetchedAt: graphContext.sourceFetchedAt,
      },
      coverage: graphContext.coverage,
      stages: (graphContext.stages || []).map(stage => ({
        name: stage.name,
        segments: (stage.segments || []).map(segment => ({
          name: segment.name,
          matchedEtfs: (segment.etfs || []).slice(0, 5).map(item => ({ code: item.code, name: item.name, relevance: item.relevance })),
          matchedIndices: (segment.indices || []).slice(0, 5).map(item => ({ code: item.code, name: item.name, relevance: item.relevance })),
          representativeCompanies: [...(segment.companies || [])].sort((a, b) => (b.representativenessScore || 0) - (a.representativenessScore || 0)).slice(0, 2).map(company => ({ code: company.code, name: company.name, matchSource: company.matchSource, matchConfidence: company.matchConfidence, representativenessScore: company.representativenessScore, selectionReason: company.selectionReason, representativeEtfs: (company.representativeEtfs||[]).slice(0,3).map(item=>({code:item.code,name:item.name,holdingVerified:item.holdingVerified,holdingWeight:item.holdingWeight,reportPeriod:item.reportPeriod})), representativeIndices: (company.representativeIndices||[]).slice(0,2).map(item=>({code:item.code,name:item.name,relevance:item.relevance})) })),
        })),
      })),
      etfExposure: (graphContext.etfExposure || []).filter(item => etfBindings.some(binding => binding.etf_code === item.code)).slice(0, 8).map(item=>({code:item.code,name:item.name,segments:(item.segments||[]).slice(0,4).map(segment=>({stageName:segment.stageName,segmentName:segment.segmentName,relevance:segment.relevance,holdingVerified:segment.holdingVerified,matchedCompanies:(segment.matchedCompanies||[]).slice(0,4)}))})),
      eventPropagation: (graphContext.eventMappings || []).slice(0, 5).map(item=>({eventId:item.eventId,title:item.title,directSegmentNames:(item.directSegmentNames||[]).slice(0,4),paths:(item.paths||[]).slice(0,1).map(path=>({segmentNames:(path.segmentNames||[]).slice(0,5),direction:path.direction,weight:path.weight,confidence:path.confidence,affectedCompanies:(path.affectedCompanies||[]).slice(0,5),affectedEtfs:(path.affectedEtfs||[]).slice(0,5)}))})),
      mappingStatus: graphMappingValidation,
      limitation: '图谱关系用于界定产业范围、选择企业样本和构造ETF暴露及传导假设；匹配置信度与历史持仓不单独构成交易信号，披露期不代表实时权重。',
    } : null
    const generatedAt = new Date().toISOString()
    const frozenTiming = context.artifacts.get('decision-timing') as DecisionTimingAssessment | undefined
    const decisionTiming = frozenTiming ? finalizeDecisionTiming(frozenTiming, generatedAt) : effectiveDecisionTiming(undefined, generatedAt)
    const portfolioDecisionSupport = applyDecisionTimingGate(context.artifacts.get('portfolio-decision-support'), decisionTiming)
    const analysisStatuses = {
      market: context.artifacts.get('market-analysis-ai-status') || null,
      event: context.artifacts.get('news-analysis-ai-status') || null,
      company: context.artifacts.get('company-analysis-ai-status') || null,
      industry: context.artifacts.get('industry-overview-ai-status') || null,
      investment: context.artifacts.get('investment-advice-ai-status') || null,
      portfolio: context.artifacts.get('portfolio-analysis-ai-status') || null,
    }
    const consistencyIssues=[...new Set([
      ...['market-analysis','news-analysis','company-analysis','industry-overview','investment-advice'].flatMap(key=>(context.artifacts.get(`${key}-consistency`)||[]).filter((issue:{severity:string})=>issue.severity==='error').map((issue:{detail:string})=>issue.detail)),
      ...[marketAnalysis,companyAnalysis,sentimentAnalysis,industryAnalysis,investmentAdvice].flatMap(value=>auditResearchConsistency(value,context.artifacts.get('company-market-data')).map(issue=>issue.detail)),
      ...[marketAnalysis,companyAnalysis,sentimentAnalysis,industryAnalysis,investmentAdvice].flatMap(value=>auditReportFacts(value,{ evaluation, snapshot:context.artifacts.get('research-snapshot'),companyData:context.artifacts.get('company-market-data') }).issues.filter(issue=>issue.severity==='error').map(issue=>issue.detail)),
    ])] as string[]
    const finalSections:Record<string,unknown>={'market-analysis':marketAnalysis,'news-analysis':sentimentAnalysis,'company-analysis':companyAnalysis,'industry-overview':industryAnalysis,'investment-advice':investmentAdvice}
    const collectReferenceIssues=(value:unknown):string[]=>{
      if(typeof value==='string'){try{return collectReferenceIssues(JSON.parse(value))}catch{return []}}
      if(Array.isArray(value))return value.flatMap(collectReferenceIssues)
      if(!value||typeof value!=='object')return []
      const row=value as Record<string,unknown>
      return [...(Array.isArray(row.referenceIssues)?row.referenceIssues.filter((item):item is string=>typeof item==='string'):[]),...Object.values(row).flatMap(collectReferenceIssues)]
    }
    const outputValidations=Object.fromEntries(Object.entries(finalSections).map(([key,value])=>{
      const previous=context.artifacts.get(`${key}-validation`)
      const issues=[...new Set([...(previous?.issues||[]),...collectReferenceIssues(value)])]
      return [key,{...previous,status:issues.length?'limited':previous?.status||'passed',issues}]
    }))
    const reportQuality = buildReportQuality({ outputValidations, consistencyIssues, evaluation, dataQuality, preflight: researchPreflight, decisionTiming, analysisStatuses, portfolioDecisionSupport })
    const reviewDelta = context.input.rulesOnly ? buildReportReviewDelta({
      current: evaluation,
      previous: parentData.researchEvaluation,
      parentRunId: context.input.parentRunId,
      baselineReportId: lineage.parent?.id || null,
    }) : null

    // 生成报告标题
    const title = `${context.input.verificationMode==='graph-e2e'?'【图谱链路验证】':''}${industryInfo?.name || '行业'} - ${context.input.rulesOnly?'规则复核':'综合投资分析'}报告`
    const reportType = context.input.verificationMode === 'graph-e2e' ? 'verification' : 'comprehensive'

    // 构建Markdown格式报告
    const generatedDraft = context.artifacts.get('social-report') as SocialReport | null | undefined
    const draft = context.input.rulesOnly ? inheritedData.socialReport : generatedDraft
    const social = draft ? normalizeSocialReport(applyContinuityReview(draft, context.artifacts.get('data-quality')),evaluation,companyAnalysis) : null
    await context.saveArtifact('public-report-validation', { continuityGuard: true, validatedReport: social }, 'DATA')
    const actions = context.artifacts.get('etf-actions') || []
    if(!context.input.rulesOnly)await context.saveArtifact('opportunity-ledger',buildOpportunityLedger({asOf:evaluation?.asOf||generatedAt,news:sentimentAnalysis,events:context.artifacts.get('news-events'),holdings:context.artifacts.get('etf-holdings'),decisions:evaluation?.decisions,graph:graphContext,history:context.artifacts.get('historical-report-context'),snapshot:context.artifacts.get('research-snapshot')}),'DATA')
    if(context.input.rulesOnly)await context.saveArtifact('opportunity-ledger',buildOpportunityLedger({asOf:evaluation?.asOf||generatedAt,news:sentimentAnalysis,events:context.artifacts.get('news-events'),holdings:context.artifacts.get('etf-holdings'),decisions:evaluation?.decisions,graph:graphContext,history:[{opportunityLedger:parentData.opportunityLedger||inheritedData.opportunityLedger||[]}],snapshot:context.artifacts.get('research-snapshot')}),'DATA')
    const finalInvestment={...record(investmentAdvice),opportunityLedger:context.artifacts.get('opportunity-ledger')||[]}
    investmentAdvice=typeof investmentAdvice==='string'?JSON.stringify(finalInvestment):finalInvestment
    const narrativeInvestment = Object.fromEntries(Object.entries(finalInvestment).filter(([key]) => !['opportunityLedger','executiveSummary','ruleAssessment','productSelection'].includes(key)))
    const narrativeOpportunities = (context.artifacts.get('opportunity-ledger') || []).map((item: Record<string, unknown>) => ({title:item.title,state:item.state,firstSeenAt:item.firstSeenAt,informationStatus:item.informationStatus,hypothesis:item.hypothesis,verification:item.verification,invalidation:item.invalidation,pricingAssessment:item.pricingAssessment,nextReview:item.nextReview,outcome:item.outcome,exposure:item.exposure}))
    const reportContent = fullResearchMarkdown({ title, onePageAvailable: !!social, actions, decisionTiming, sections: [
      { title: '核心判断与行动条件', value: executiveSummary },
      { title: '机会跟踪与验证', value: narrativeOpportunities },
      { title: '市场分析', value: marketAnalysis },
      { title: '产业资讯分析', value: sentimentAnalysis },
      { title: '产业链企业分析', value: companyAnalysis },
      { title: '产业认知基线与传导', value: graphReportSection },
      { title: '行业总览', value: industryAnalysis },
      { title: '投资假设、建议与反证', value: narrativeInvestment },
    ] })

    await context.updateProgress(1, 2, '正在保存报告...')

    // 保存到数据库
    const data = {
        type: reportType,
        industryId: industryInfo.id,
        industryName: industryInfo.name,
        title: context.input.verificationMode==='graph-e2e' ? title : social?.title || title,
        summary: `${context.input.verificationMode==='graph-e2e'?'仅用于验证知识图谱到综合报告的传递，不构成最新市场分析或交易依据。 ':''}${decisionTiming.executionReady ? '冻结研究基准已保存；交易前需复核当前报价和公告。' : `${decisionTiming.label}：${decisionTiming.reasons[0] || '使用最近完整收盘数据'}。`} ${context.input.rulesOnly
          ? `${reviewDelta?.summary || '本地规则复核已完成。'}${lineage.narrative ? ` 正文继承自${lineage.narrative.createdAt.toISOString()}的完整分析，本轮未重新调用AI。` : ''}`
          : executiveConclusion || social?.subtitle || '完整研究与ETF操作建议已生成；一页发布版暂不可用。'}`,
        content: reportContent,
        dataJson: JSON.stringify({
          opportunityLedger: context.artifacts.get('opportunity-ledger') || [],
          socialReport: social,
          socialReportStatus: context.artifacts.get('social-report-status'),
          etfActions: actions,
          researchEvaluation: evaluation,
          researchManifest: context.artifacts.get('research-manifest'),
          graphContext,
          graphMappingValidation,
          graphUsageValidation: {
            company: context.artifacts.get('company-analysis-graph-usage-validation'),
            news: context.artifacts.get('news-analysis-graph-usage-validation'),
            industry: context.artifacts.get('industry-overview-graph-usage-validation'),
            investment: context.artifacts.get('investment-advice-graph-usage-validation'),
          },
          analysisStatuses,
          outputValidations,
          factAudit: auditReportFacts(finalSections, { evaluation, snapshot: context.artifacts.get('research-snapshot'), companyData: context.artifacts.get('company-market-data') }),
          researchFacts: buildResearchFactRegistry({ evaluation, snapshot: context.artifacts.get('research-snapshot'), companyData: context.artifacts.get('company-market-data') }),
          investmentTheses: context.artifacts.get('investment-theses') || [],
          aiServiceStatus: context.artifacts.get('ai-service-status') || null,
          researchPreflight,
          dataQuality,
          reportQuality,
          strategyValidation: context.artifacts.get('strategy-validation') || null,
          decisionTiming,
          reviewDelta,
          historicalReportContext: context.artifacts.get('historical-report-context') || [],
          historicalReportPolicy: context.artifacts.get('historical-report-policy') || null,
          inheritedFromReportId: context.input.rulesOnly ? lineage.narrative?.id || null : null,
          privatePortfolioAnalysis: context.artifacts.get('portfolio-analysis'),
          portfolioDecisionSupport,
          privateForwardCohort: context.artifacts.get('portfolio-forward-cohort') || null,
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
            graphRevisionId: graphContext?.revisionId || null,
            graphMappingRevisionId: graphContext?.mappingRevisionId || null,
            graphMappingContentHash: graphContext?.mappingContentHash || null,
            verificationMode: context.input.verificationMode || null
          }
        })
      }
    // Recover from a save succeeding before the worker could persist report-id.
    const existing = await prisma.aIAnalysisReport.findFirst({ where: { type: reportType, dataJson: { contains: JSON.stringify({ runId: context.runId }).slice(1, -1) } } })
    const report = await withDatabaseBusyRetry(() => existing
      ? prisma.aIAnalysisReport.update({ where: { id: existing.id }, data })
      : prisma.aIAnalysisReport.create({ data }))

    await context.updateProgress(2, 2, '报告生成完成')

    // 保存报告ID
    await context.saveArtifact('report-id', report.id, 'REFERENCE')
    await context.saveArtifact('report-content', reportContent, 'DATA')
    if (context.artifacts.has('portfolio-forward-cohort')) {
      const { linkPortfolioForwardCohortReport } = await import('@/lib/portfolio/forward-cohort-store')
      await linkPortfolioForwardCohortReport({ runId: context.runId, reportId: report.id })
    }
  }
}
