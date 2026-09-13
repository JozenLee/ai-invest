import { captureResearchSnapshot, persistResearchSnapshot } from '@/lib/research/store'
import type { StepDefinition } from '../types'
import { ensureResearchInputsFresh } from '@/lib/research/preflight'
import { isTradingSessionTime } from '@/lib/analysis/decision-timing'
import { graphContextIssues, graphMappingIssues } from '@/lib/graph/research-context'
import { withDatabaseBusyRetry } from '@/lib/db/retry'
export const freezeResearchStep: StepDefinition = {
  name:'freeze-research',description:'冻结领域配置、交易日历与全部研究证据',dependencies:[],estimatedDuration:1000,
  async execute(context) {
    await context.updateProgress(0,2,'正在检查关键研究数据时效并等待必要同步')
    const startedAt=new Date().toISOString()
    const preflight=await ensureResearchInputsFresh(context.input.industryId,{refresh:context.input.rulesOnly!==true&&context.input.refreshResearchData!==false,tradingSession:isTradingSessionTime(startedAt),asOf:startedAt})
    await context.saveArtifact('research-preflight',preflight,'DATA')
    if(preflight.status==='blocked')throw new Error(preflight.warnings.join('；')||'关键研究数据同步未完成')
    await context.updateProgress(1,2,preflight.status==='fresh'?'关键数据已同步，正在冻结快照':'部分数据源受限，正在按严格门禁冻结可用证据')
    const snapshot=await captureResearchSnapshot(context.input.industryId)
    await context.saveArtifact('research-preflight',{...preflight,publicationNotes:[...new Set(snapshot.etfs.flatMap(etf=>etf.product.publicationNotes||[]))]},'DATA')
    if(snapshot.decisionTiming?.phase==='trading'&&context.input.verificationMode!=='graph-e2e'){
      const coverage=snapshot.decisionTiming.quoteCoverage
      const missing:string[]=[]
      if(coverage.fresh<coverage.total)missing.push(`指数基金实时行情仅 ${coverage.fresh}/${coverage.total} 达到5分钟时效`)
      if(snapshot.benchmarkBars.at(-1)?.date!==snapshot.decisionTiming.tradingDate)missing.push('市场基准实时行情未达到5分钟时效')
      const flowDates=new Set(snapshot.sectorFlows.filter(row=>snapshot.profile.sectors.includes(row.sector)).map(row=>row.date))
      if(snapshot.profile.sectors.length&&!flowDates.has(snapshot.decisionTiming.tradingDate))missing.push('当日领域资金快照未同步')
      if(missing.length)throw new Error(`盘中分析未取得完整实时行情：${missing.join('；')}。本轮未生成使用上一交易日价格的报告`)
    }
    if(context.input.verificationMode==='graph-e2e'&&snapshot.decisionTiming)snapshot.decisionTiming={...snapshot.decisionTiming,executionReady:false,label:'仅供投资参考',validUntil:null,reasons:['图谱端到端验证使用当前本地数据快照，不可用于交易执行',...snapshot.decisionTiming.reasons],basis:`${snapshot.decisionTiming.basis}；本轮仅用于图谱端到端验证`}
    const graphIssues=graphContextIssues(snapshot.graphContext)
    const mappingIssues=graphMappingIssues(snapshot.graphContext)
    await context.saveArtifact('graph-context-validation',{status:graphIssues.length?'blocked':'passed',issues:graphIssues,revisionId:snapshot.graphContext?.revisionId||null},'DATA')
    await context.saveArtifact('graph-mapping-validation',{status:mappingIssues.length?'limited':'passed',issues:mappingIssues,mappingRevisionId:snapshot.graphContext?.mappingRevisionId||null,mappingContentHash:snapshot.graphContext?.mappingContentHash||null,mappingSource:snapshot.graphContext?.mappingSource||null,coverage:snapshot.graphContext?.coverage||null},'DATA')
    if(graphIssues.length)throw new Error(`产业认知门禁未通过：${graphIssues.join('；')}`)
    snapshot.workflow={runId:context.runId,parentRunId:context.input.parentRunId||null,baselineSnapshotId:context.input.baselineSnapshotId||null}
    await withDatabaseBusyRetry(()=>persistResearchSnapshot(snapshot))
    const transportSnapshot={...snapshot,records:undefined}
    await context.saveArtifact('research-snapshot',transportSnapshot,'DATA')
    await context.saveArtifact('decision-timing',snapshot.decisionTiming,'DATA')
    await context.saveArtifact('historical-report-context',snapshot.historicalReports||[],'DATA')
    await context.saveArtifact('historical-report-policy',snapshot.profile.historyReports||{enabled:true,lookbackTradingDays:10,mode:'latest-per-trading-day'},'DATA')
    await context.saveArtifact('graph-context',snapshot.graphContext||null,'DATA')
    await context.saveArtifact('research-manifest',{id:snapshot.id,asOf:snapshot.asOf,version:snapshot.version,evidence:snapshot.evidence,graphRevision:snapshot.graphContext?{revisionId:snapshot.graphContext.revisionId,version:snapshot.graphContext.version,contentHash:snapshot.graphContext.contentHash,mappingRevisionId:snapshot.graphContext.mappingRevisionId,mappingContentHash:snapshot.graphContext.mappingContentHash,mappingPublishedAt:snapshot.graphContext.mappingPublishedAt,sourceFetchedAt:snapshot.graphContext.sourceFetchedAt}:null},'DATA')
    await context.updateProgress(2,2,`已冻结研究输入；${snapshot.decisionTiming?.label||'时效待核验'}；后续步骤与恢复不重读实时数据`)
  },
}
