import type { StepDefinition } from '../types'
import type { ResearchSnapshot } from '@/lib/research/contracts'
import { historicalStrategyValidation, latestReportEvaluation, persistEvaluation, readSnapshot } from '@/lib/research/store'
import { decisionConfidence, reportAdviceConfidence } from '@/lib/analysis/report-insights'

export const etfActionStep: StepDefinition = {
  name: 'etf-actions', description: '逐ETF规则决策、条件校验与变更记录（实验研究）',
  dependencies: ['assess-data-quality'], estimatedDuration: 1000,
  async execute(context) {
    const snapshot=context.artifacts.get('research-snapshot') as ResearchSnapshot|undefined
    if(!snapshot) throw new Error('缺少冻结研究快照，请新建分析')
    const frozen=await readSnapshot(snapshot.id)
    const previous=await latestReportEvaluation(frozen.profile.industryId,frozen.asOf,context.input.baselineSnapshotId)
    const evaluation=await persistEvaluation(frozen,previous?.snapshotId===frozen.id?null:previous)
    await context.saveArtifact('research-evaluation',evaluation,'DATA')
    await context.saveArtifact('strategy-validation',await historicalStrategyValidation(frozen,evaluation),'DATA')
    const reportConfidence=reportAdviceConfidence(evaluation,context.artifacts.get('data-quality'))
    await context.saveArtifact('etf-actions',evaluation.decisions.map(decision=>({...decision,confidencePct:Math.min(decisionConfidence(decision),reportConfidence)})),'DATA')
    await context.updateProgress(1,1,'已逐只生成带置信度的投资建议；缺失数据会降低置信度或转为观望')
  }
}
