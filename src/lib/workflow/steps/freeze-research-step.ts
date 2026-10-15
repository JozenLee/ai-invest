import { captureResearchSnapshot, persistResearchSnapshot, getResearchProfile } from '@/lib/research/store'
import type { StepDefinition } from '../types'
import { ensureResearchInputsFresh } from '@/lib/research/preflight'
import { graphContextIssues, graphMappingIssues } from '@/lib/graph/research-context'
import { withDatabaseBusyRetry } from '@/lib/db/retry'
import { workflowNodeConfig } from '../method-config'
import { selectResearchCompanies } from '../company-selection'
import { capturePortfolioEvidence } from './fetch-portfolio-step'
import { readPortfolioProductResearch } from '@/lib/services/portfolio-product-research.service'
import { buildPortfolioPlanningHoldings } from '@/lib/portfolio/product-research'
import { requiredPortfolioEtfs } from '@/lib/portfolio/research-scope'
export const freezeResearchStep: StepDefinition = {
  name:'freeze-research',description:'冻结领域配置、交易日历与全部研究证据',dependencies:[],estimatedDuration:1000,
  async execute(context) {
    await context.updateProgress(0,2,'正在检查关键研究数据时效并等待必要同步')
    const startedAt=new Date().toISOString()
    // Collection is owned by the subscription worker. A report freezes whatever
    // is already persisted and exposes freshness gaps; it must never wait behind
    // an unrelated sector-wide refresh queue.
    const preflight=await ensureResearchInputsFresh(context.input.industryId,{refresh:false,asOf:startedAt})
    await context.saveArtifact('research-preflight',preflight,'DATA')
    if(preflight.status==='blocked')throw new Error(preflight.warnings.join('；')||'关键研究数据同步未完成')
    await context.updateProgress(1,2,preflight.status==='fresh'?'关键数据已同步，正在冻结快照':'部分数据源受限，正在按严格门禁冻结可用证据')
    let privateAccount=context.artifacts.get('frozen-portfolio-evidence')
    if (!privateAccount) {
      // publicOnly forbids sending private holdings to AI; it does not disable
      // local deterministic portfolio constraints or the public-code collector.
      privateAccount=await capturePortfolioEvidence()
      await context.saveArtifact('frozen-portfolio-evidence', privateAccount, 'DATA')
      context.artifacts.set('frozen-portfolio-evidence',privateAccount)
    }
    let additionalEtfs: Array<{code:string;name:string}>=[]
    if(!privateAccount.excluded){
      const asOf=new Date().toISOString()
      const universe=await readPortfolioProductResearch(privateAccount.holdings,asOf,undefined,privateAccount.portfolioId)
      const planning=buildPortfolioPlanningHoldings({holdings:privateAccount.holdings,universe})
      await context.saveArtifact('frozen-portfolio-product-research',universe,'DATA')
      await context.saveArtifact('portfolio-product-packet',planning.evidencePackets,'DATA')
      await context.saveArtifact('frozen-portfolio-evidence',{...privateAccount,holdings:planning.planningHoldings},'DATA')
      context.artifacts.set('portfolio-product-packet',planning.evidencePackets)
      context.artifacts.set('frozen-portfolio-evidence',{...privateAccount,holdings:planning.planningHoldings})
      const profile=await getResearchProfile(context.input.industryId)
      additionalEtfs=requiredPortfolioEtfs(planning.planningHoldings,universe.requests,{id:context.input.industryId,name:profile.name})
    }
    const snapshot=await captureResearchSnapshot(context.input.industryId,{additionalEtfs})
    if(!privateAccount.excluded){
      const frozen=context.artifacts.get('frozen-portfolio-evidence')
      const packets=(context.artifacts.get('portfolio-product-packet')||[]) as Array<Record<string,unknown>>
      const industryCodes=new Set(snapshot.companies.map(company=>company.code))
      const holdings=frozen.holdings.map((holding:Record<string,unknown>)=>{
        const packet=packets.find(item=>item.ticker===holding.ticker) as Record<string,unknown>|undefined
        const disclosed=(packet?.disclosedHoldings||[]) as Array<Record<string,unknown>>
        const lookThrough=((packet?.exposure as Record<string,unknown>|undefined)?.lookThrough||[]) as Array<Record<string,unknown>>
        const rows=lookThrough.length?lookThrough:disclosed
        const reportIndustryExposurePct=rows.reduce((sum,row)=>industryCodes.has(String(row.code))?sum+Number(row.weightPct||0):sum,0)
        const targetIncluded=snapshot.etfs.some(etf=>etf.ticker===holding.targetEtfCode)
        return {...holding,reportIndustryExposurePct:targetIncluded?100:Math.min(100,reportIndustryExposurePct),reportIndustryEvidenceIds:[...new Set(rows.filter(row=>industryCodes.has(String(row.code))).flatMap(row=>Array.isArray(row.evidence)?(row.evidence as Array<Record<string,unknown>>).map(item=>String(item.id)):[]))]}
      })
      const enriched={...frozen,industryWeightPct:holdings.reduce((sum:number,row:Record<string,unknown>)=>sum+Number(row.weightPct||0)*(Number(row.reportIndustryExposurePct||0)/100),0),holdings}
      await context.saveArtifact('frozen-portfolio-evidence',enriched,'DATA')
      context.artifacts.set('frozen-portfolio-evidence',enriched)
    }
    const companyConfig=workflowNodeConfig(context,'fetch-companies')
    const companyProjection=(snapshot.projections['fetch-company-data']?.['company-market-data']||[]) as Array<Record<string,unknown>&{code?:string;stockCode?:string}>
    const selection=selectResearchCompanies(companyProjection,{methodId:companyConfig?.methodId,maxCompanies:Number(companyConfig?.parameters.maxCompanies??30)})
    const selectedCodes=new Set(selection.selected.map(company=>String(company.code||company.stockCode||'')))
    snapshot.companies=snapshot.companies.filter(company=>selectedCodes.has(company.code))
    snapshot.projections['fetch-companies']={
      companies:selection.selected.map(company=>({stockCode:company.code||company.stockCode,stockName:company['name']||company['stockName'],source:company['pool']||company['source'],stage:company['stage'],stageCode:company['stageCode'],segment:company['segment'],segmentCode:company['segmentCode'],matchSource:company['matchSource'],matchConfidence:company['matchConfidence'],representativenessScore:company['representativenessScore'],selectionReason:company['selectionReason'],representativeEtfs:company['representativeEtfs'],representativeIndices:company['representativeIndices']})),
      'company-codes':selection.selected.map(company=>company.code||company.stockCode).join(','),
      'company-selection-summary':{methodId:selection.methodId,maxCompanies:selection.maxCompanies,candidateCount:selection.candidateCount,selectedCount:selection.selected.length,status:'passed'},
    }
    snapshot.projections['fetch-company-data']={'company-market-data':selection.selected}
    const projectedQuality=snapshot.projections['assess-data-quality']?.['data-quality'] as Record<string,unknown>|undefined
    if(projectedQuality){
      const rows=selection.selected as Array<Record<string,unknown>>
      projectedQuality.companyCoverage={total:rows.length,financials:rows.filter(row=>Array.isArray(row.financials)&&(row.financials as unknown[]).length>0).length,profitGrowth:rows.filter(row=>typeof row.profitGrowthPct==='number').length,cashQuality:rows.filter(row=>typeof row.cashConversionPct==='number').length,announcements:rows.filter(row=>Array.isArray(row.announcements)&&(row.announcements as unknown[]).length>0).length}
    }
    const projectedStatus=String(projectedQuality?.status||'missing')
    const acceptedPartial=projectedStatus==='available'&&preflight.failed===0&&preflight.partial>0
    const effectivePreflight=acceptedPartial?{...preflight,status:'fresh',completed:preflight.completed+preflight.partial,partial:0,warnings:[],advisories:preflight.warnings,acceptance:'当日收盘、复权、基准、企业与事件核心门禁全部可用；净值、份额、估值或部分报表缺口继续作为字段级未知，不构成数据回退'}:preflight
    await context.saveArtifact('research-preflight',{...effectivePreflight,publicationNotes:[...new Set(snapshot.etfs.flatMap(etf=>etf.product.publicationNotes||[]))]},'DATA')
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
    await context.saveArtifact('decision-history-context',snapshot.projections['freeze-research']?.['decision-history-context']||null,'DATA')
    await context.saveArtifact('graph-context',snapshot.graphContext||null,'DATA')
    await context.saveArtifact('research-manifest',{id:snapshot.id,asOf:snapshot.asOf,version:snapshot.version,evidence:snapshot.evidence,graphRevision:snapshot.graphContext?{revisionId:snapshot.graphContext.revisionId,version:snapshot.graphContext.version,contentHash:snapshot.graphContext.contentHash,mappingRevisionId:snapshot.graphContext.mappingRevisionId,mappingContentHash:snapshot.graphContext.mappingContentHash,mappingPublishedAt:snapshot.graphContext.mappingPublishedAt,sourceFetchedAt:snapshot.graphContext.sourceFetchedAt}:null},'DATA')
    await context.updateProgress(2,2,`已冻结研究输入；${snapshot.decisionTiming?.label||'数据口径待核验'}；后续步骤与恢复不重读行情数据`)
  },
}
