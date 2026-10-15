import { compareDomainResearch } from '../domain-research'
import { validateDomainHistory } from '@/lib/research/domain-validation'
import type { DomainResearch } from '../domain-research'
import { researchLoopMetrics } from '@/lib/research/loop-metrics'
import { savePipelineHealth, type PipelineHealth } from '@/lib/research/strategy/health'
import { workflowPerformance } from '../performance'
import { financialFacts } from '@/lib/analysis/financial-facts'
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
import { archiveUnifiedDecisionVersion } from '@/lib/research/decision-ledger'

type ArchivedReportData = {
  socialReport?: SocialReport | null
  researchEvaluation?: Evaluation
  marketAnalysis?: unknown
  industryAnalysis?: unknown
  companyAnalysis?: unknown
  sentimentAnalysis?: unknown
  investmentAdvice?: unknown
  analysisStatuses?: Parameters<typeof buildReportQuality>[0]['analysisStatuses']
  outputValidations?: Parameters<typeof buildReportQuality>[0]['outputValidations']
  inputCoverage?: Parameters<typeof buildReportQuality>[0]['inputCoverage']
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
  dependencies: ['domain-research', 'social-report', 'portfolio-analysis', 'portfolio-decision', 'etf-actions'],
  estimatedDuration: 5000,

  async execute(context) {
    await context.updateProgress(0, 2, '正在整合分析结果...')

    // 收集所有分析结果
    const industryInfo = context.artifacts.get('industry-info')
    const lineage = context.input.rulesOnly ? await reviewLineage(context.input.parentRunId) : { parent: null, narrative: null }
    const parentData = parseArchivedData(lineage.parent?.dataJson || null)
    const inheritedData = parseArchivedData(lineage.narrative?.dataJson || null)
    const evidenceSources=(context.artifacts.get('research-evaluation')?.evidence||context.artifacts.get('research-snapshot')?.evidence||[]) as Evaluation['evidence']
    const industryAnalysis = auditEvidenceTree(context.input.rulesOnly ? inheritedData.industryAnalysis : context.artifacts.get('industry-overview'),evidenceSources)
    const companyAnalysis = auditEvidenceTree(context.input.rulesOnly ? inheritedData.companyAnalysis : context.artifacts.get('company-analysis'),evidenceSources)
    const inheritedSentiment = context.input.rulesOnly ? inheritedData.sentimentAnalysis : context.artifacts.get('news-analysis')
    const investmentAdvice = auditEvidenceTree(context.artifacts.get('investment-advice'),evidenceSources)
    const investmentRecord = record(investmentAdvice)
    const executiveSummary = record(investmentRecord.executiveSummary)
    const domainResearch = context.artifacts.get('domain-research')
    const executiveConclusion = String((domainResearch?.status === 'completed' ? domainResearch.opinion?.conclusion : null) || executiveSummary.conclusion || investmentRecord.thesis || '').replace(/\s+/g, ' ').trim()
    const marketAnalysis = auditEvidenceTree(context.input.rulesOnly ? inheritedData.marketAnalysis : context.artifacts.get('market-analysis'),evidenceSources)
    const etfBindings = (context.artifacts.get('etf-bindings') as Array<Record<string, unknown>> | undefined) || []
    const evaluation = context.artifacts.get('research-evaluation') as Evaluation | undefined
    const dataQuality = context.artifacts.get('data-quality')
    const rawResearchPreflight = context.artifacts.get('research-preflight')
    const researchPreflight = dataQuality?.status==='available'&&!(rawResearchPreflight?.failed||0)&&rawResearchPreflight?.status!=='blocked'
      ? {...rawResearchPreflight,status:'fresh',completed:(rawResearchPreflight.completed||0)+(rawResearchPreflight.partial||0),partial:0,advisories:rawResearchPreflight.advisories||rawResearchPreflight.warnings||[],warnings:[],acceptance:rawResearchPreflight.acceptance||'核心行情、复权、基准、企业与事件证据门禁已通过；后台低频字段刷新仅作审计提示，未用于替换或补造本轮证据'}
      : rawResearchPreflight
    const graphContext = (context.artifacts.get('graph-context') || context.artifacts.get('research-snapshot')?.graphContext) as FrozenGraphContext | undefined
    const graphMappingValidation = context.artifacts.get('graph-mapping-validation')
    const sentimentAnalysis = auditEvidenceTree(refreshEventPaths(inheritedSentiment,graphContext),evidenceSources)
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
    const loopMetrics = researchLoopMetrics(investmentAdvice, generatedAt, context.artifacts.get('auto-reanalysis'))
    await context.saveArtifact('research-loop-metrics', loopMetrics, 'DATA')
    const execution = await prisma.executionRun.findUnique({where:{id:context.runId},select:{startedAt:true,steps:{select:{stepName:true,attempts:{select:{startedAt:true,completedAt:true,status:true}},artifacts:{where:{OR:[{artifactKey:{startsWith:'ai-response-execution-'}},{artifactKey:{startsWith:'ai-error-execution-'}}]},select:{artifactKey:true,data:true}}}}}})
    const performance = execution ? workflowPerformance(execution.startedAt,execution.steps,generatedAt) : null
    await context.saveArtifact('workflow-performance',performance,'DATA')
    const frozenTiming = context.artifacts.get('decision-timing') as DecisionTimingAssessment | undefined
    const decisionTiming = frozenTiming ? finalizeDecisionTiming(frozenTiming, generatedAt) : effectiveDecisionTiming(undefined, generatedAt)
    const portfolioDecisionSupport = applyDecisionTimingGate(context.artifacts.get('portfolio-decision-support'), decisionTiming)
    const analysisStatuses = context.input.rulesOnly ? {...inheritedData.analysisStatuses,investment:{status:'deterministic'}} : {
      market: context.artifacts.get('market-analysis-ai-status') || null,
      event: context.artifacts.get('news-analysis-ai-status') || null,
      company: context.artifacts.get('company-analysis-ai-status') || null,
      industry: context.artifacts.get('industry-overview-ai-status') || null,
      investment: context.artifacts.get('investment-advice-ai-status') || null,
    }
    const outputValidations:NonNullable<ArchivedReportData['outputValidations']>=context.input.rulesOnly?{...inheritedData.outputValidations}:Object.fromEntries(['market-analysis','news-analysis','company-analysis','industry-overview','investment-advice'].map(key=>[key,context.artifacts.get(`${key}-validation`)||null]))
    const inputCoverage=context.input.rulesOnly?{...inheritedData.inputCoverage}:Object.fromEntries(['market-analysis','news-analysis','company-analysis','industry-overview','investment-advice'].map(key=>[key,context.artifacts.get(`${key}-input-coverage`)||null]))
    if(!context.input.rulesOnly)outputValidations['investment-consistency']=context.artifacts.get('investment-advice-consistency-validation')||null
    const reportQuality = buildReportQuality({ evaluation, dataQuality, preflight: researchPreflight, decisionTiming, analysisStatuses,outputValidations,inputCoverage,strategyValidation:context.artifacts.get('strategy-validation'),investmentAdvice,portfolioDecisionSupport })
    await context.saveArtifact('report-quality', reportQuality, 'DATA')
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
    const aiProductDecisions=Array.isArray(investmentRecord.productDecisions)?investmentRecord.productDecisions as Array<Record<string,unknown>>:[]
    const actions = aiProductDecisions.length?aiProductDecisions.map(item=>({
      ticker:String(item.ticker||''),name:String(etfBindings.find(binding=>binding.etf_code===item.ticker)?.etf_name||item.ticker||''),
      unheldAction:item.unheldAction,heldAction:item.heldAction,reason:String(item.reason||''),trigger:String(item.trigger||''),invalidation:String(item.invalidation||''),
      quantitativeOverride:typeof item.quantitativeOverride==='string'?item.quantitativeOverride:null,executionContract:item.executionContract,
      horizon:`${evaluation?.profile.horizonDays||20}个交易日`,evidence:Array.isArray(item.evidenceIds)?item.evidenceIds.map(String):[],confidencePct:Number(item.confidencePct)||0,decisionSource:'ai' as const,
    })):context.artifacts.get('etf-actions') || []
    // Product decisions are rendered once by the dedicated action section below.
    // Keeping the same ten contracts inside the narrative doubled report length
    // and made the primary conclusion harder to scan; the full objects remain in
    // dataJson for audit and UI drill-down.
    const investmentNarrative={...investmentRecord,productDecisions:undefined,thesis:investmentRecord.thesis===executiveSummary.conclusion?undefined:investmentRecord.thesis}
    const reportContent = fullResearchMarkdown({ title, onePageAvailable: !!social, actions, decisionTiming, executiveConclusion,executionSummary:`当前通过核验的可交易产品 ${reportQuality.executionAudit?.tradableProducts||0} 只；个人组合可执行项 ${reportQuality.executionAudit?.executablePortfolioActions||0} 项。研究观点与操作许可分别列示。`,sections: [
      { title: '独立领域研究（不构成账户交易指令）', value: context.artifacts.get('domain-research') },
      { title: '市场分析', value: marketAnalysis },
      { title: '产业资讯分析', value: sentimentAnalysis },
      { title: '产业链企业分析', value: companyAnalysis },
      { title: '产业认知基线与传导', value: graphReportSection },
      { title: '行业总览', value: industryAnalysis },
      { title: '投资建议与反证', value: investmentNarrative },
    ] })

    await context.updateProgress(1, 2, '正在保存报告...')

    let domainValidation = null
    if (domainResearch?.status === 'completed' && context.artifacts.get('research-snapshot')) {
      // Extract just the small research records rather than loading megabyte reports.
      const previous = await prisma.$queryRaw<Array<{ research: string }>>`
        SELECT json_extract(dataJson, '$.domainResearch') AS research FROM AIAnalysisReport
        WHERE industryId = ${industryInfo.id} AND type = 'comprehensive'
          AND json_valid(dataJson) AND json_extract(dataJson, '$.domainResearch.status') = 'completed'
        ORDER BY createdAt DESC LIMIT 120`
      const history = previous.flatMap(row => { try { return [JSON.parse(row.research) as DomainResearch] } catch { return [] } })
      domainValidation = validateDomainHistory([...history, domainResearch], context.artifacts.get('research-snapshot'))
      await context.saveArtifact('domain-validation', domainValidation, 'DATA')
    }

    // 保存到数据库
    const data = {
        type: reportType,
        industryId: industryInfo.id,
        industryName: industryInfo.name,
        title: context.input.verificationMode==='graph-e2e' ? title : social?.title || title,
        summary: `${context.input.verificationMode==='graph-e2e'?'仅用于验证知识图谱到综合报告的传递，不构成最新市场分析或交易依据。 ':''}${decisionTiming.label}。${decisionTiming.basis} ${context.input.rulesOnly
          ? `${reviewDelta?.summary || '本地规则复核已完成。'}${lineage.narrative ? ` 正文继承自${lineage.narrative.createdAt.toISOString()}的完整分析，本轮未重新调用AI。` : ''}`
          : executiveConclusion || social?.subtitle || '完整研究与ETF操作建议已生成；一页发布版暂不可用。'}`,
        content: reportContent,
        dataJson: JSON.stringify({
          domainResearch: context.artifacts.get('domain-research') || null,
          domainValidation,
          domainComparison: compareDomainResearch(context.artifacts.get('domain-research'), investmentAdvice, evaluation?.snapshotId || ''),
          socialReport: social,
          performance,
          dataRemediationPlan:context.artifacts.get('data-remediation-plan')||[],
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
          canonicalFinancialFacts: financialFacts(context.artifacts.get('company-market-data')),
          inputCoverage,
          researchPreflight,
          dataQuality,
          reportQuality,
          loopMetrics,
          autoReanalysis: context.artifacts.get('auto-reanalysis') || null,
          strategyValidation: context.artifacts.get('strategy-validation') || null,
          decisionTiming,
          reviewDelta,
          historicalReportContext: context.artifacts.get('historical-report-context') || [],
          unifiedAllocation:context.artifacts.get('unified-allocation')||null,
          historicalReportPolicy: context.artifacts.get('historical-report-policy') || null,
          inheritedFromReportId: context.input.rulesOnly ? lineage.narrative?.id || null : null,
          privatePortfolioAnalysis: context.artifacts.get('portfolio-analysis'),
          portfolioDecisionSupport,
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
            verificationMode: context.input.verificationMode || null,
            workflowVersion: context.input.workflowVersion || 'legacy',
            workflowDefinitionHash: context.input.definitionHash || null,
            nodeConfigs: context.input.nodeConfigs || {},
          }
        })
      }
    // Recover from a save succeeding before the worker could persist report-id.
    const existing = await prisma.aIAnalysisReport.findFirst({ where: { type: reportType, dataJson: { contains: JSON.stringify({ runId: context.runId }).slice(1, -1) } } })
    const report = existing
      ? await prisma.aIAnalysisReport.update({ where: { id: existing.id }, data })
      : await prisma.aIAnalysisReport.create({ data })

    let decisionVersionId:string|null=null
    if(reportType==='comprehensive'&&evaluation?.snapshotId){
      const decisionVersion=await archiveUnifiedDecisionVersion({reportId:report.id,industryId:evaluation.profile.industryId,runId:context.runId,snapshotId:evaluation.snapshotId,generatedAt,
        horizonTradingDays:evaluation.profile.horizonDays,evaluation,investmentAdvice,reportQuality,allocation:context.artifacts.get('unified-allocation')})
      decisionVersionId=decisionVersion.id
      const archived=JSON.parse(data.dataJson) as Record<string,unknown>
      const dataJson=JSON.stringify({...archived,decisionVersionId})
      await prisma.aIAnalysisReport.update({where:{id:report.id},data:{dataJson}})
      await context.saveArtifact('unified-decision-version',decisionVersion,'DATA')
    }

    await context.updateProgress(2, 2, '报告生成完成')

    // 保存报告ID
    await context.saveArtifact('report-id', report.id, 'REFERENCE')
    await context.saveArtifact('report-content', reportContent, 'DATA')
    if(reportType==='comprehensive'&&evaluation?.snapshotId){
      const health:PipelineHealth={runId:context.runId,reportId:report.id,snapshotId:evaluation.snapshotId,decisionVersionId,asOf:generatedAt,report:'completed',decision:context.artifacts.get('unified-allocation')?.status==='ready'?'ready':'blocked',validation:'disabled',execution:'pending'}
      try{
        const {labSettings,runLab}=await import('@/lib/research/lab/store')
        if((await labSettings(evaluation.profile.industryId)).enabled){
          const experiment=await runLab(evaluation.profile.industryId,evaluation.snapshotId)
          health.validation='completed'
          await context.saveArtifact('strategy-lab-status',{status:'completed',asOf:experiment.asOf,decisionVersionId:experiment.decisionVersionId||decisionVersionId},'DATA')
        }
      }catch(error){health.validation='failed';health.reason=error instanceof Error?error.message:'实验运行失败';await context.saveArtifact('strategy-lab-status',{status:'failed',reason:health.reason},'DATA')}
      try{
        const {dailyExecution}=await import('@/lib/research/lab/daily-store')
        const daily=await dailyExecution(evaluation.profile.industryId)
        health.execution=daily.plan.blockers.length||daily.plan.actions.some(action=>action.status==='blocked')?'blocked':'ready'
        await context.saveArtifact('portfolio-daily-plan-id',daily.plan.id,'REFERENCE')
      }catch(error){health.execution='failed';health.reason=[health.reason,error instanceof Error?error.message:'执行计划生成失败'].filter(Boolean).join('；')}
      await savePipelineHealth(evaluation.profile.industryId,health)
      await context.saveArtifact('pipeline-health',health,'DATA')
    }
  }
}
