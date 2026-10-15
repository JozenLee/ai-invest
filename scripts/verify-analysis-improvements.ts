import { config } from 'dotenv'
import assert from 'node:assert/strict'
import { auditedResearchPrompt, researchEvidence } from '../src/lib/workflow/research-input'
import { financialFacts, auditFinancialFacts } from '../src/lib/analysis/financial-facts'
import { applyExecutionQuality } from '../src/lib/analysis/report-quality'
import { effectiveDecisionTiming } from '../src/lib/analysis/decision-timing'
import { decisionSemanticIssues, normalizeAIProductDecisions } from '../src/lib/analysis/investment-conclusion'
import type { StepContext } from '../src/lib/workflow/types'
config({quiet:true})
async function main(){
  const {prisma}=await import('../src/lib/db')
  try{
    const report=await prisma.aIAnalysisReport.findFirst({where:{type:'comprehensive',dataJson:{contains:'"kind":"analysis"'}},orderBy:{createdAt:'desc'}})
    assert(report?.dataJson,'缺少最新综合报告')
    const data=JSON.parse(report.dataJson)
    const run=await prisma.executionRun.findUnique({where:{id:data.metadata.runId},include:{steps:{orderBy:{stepIndex:'asc'},include:{artifacts:true}}}})
    assert(run,'报告没有执行记录')
    const artifacts=new Map<string,unknown>()
    for(const step of run.steps)for(const artifact of step.artifacts){try{artifacts.set(artifact.artifactKey,JSON.parse(artifact.data||'null'))}catch{artifacts.set(artifact.artifactKey,artifact.data)}}
    const ctx:StepContext={runId:run.id,stepId:'readonly-verification',attemptNumber:1,input:{industryId:report.industryId,publicOnly:true},artifacts,saveArtifact:async(key,value)=>{artifacts.set(key,value)},updateProgress:async()=>{}}
    const budgets=[]
    for(const stage of ['market-analysis','news-analysis','company-analysis','industry-overview','investment-advice']){
      let prompt:string
      try{prompt=await auditedResearchPrompt(ctx,stage)}catch(error){console.error(stage,artifacts.get(`${stage}-input-budget`));throw error}
      budgets.push({stage,characters:prompt.length,audit:artifacts.get(`${stage}-input-budget`)})
    }
    const history=researchEvidence(ctx,'investment-advice').historicalReportContext as Array<{sessionDate:string}>
    const latest=[...(data.historicalReportContext||[])].sort((a,b)=>b.sessionDate.localeCompare(a.sessionDate)).slice(0,2).map(row=>row.sessionDate)
    assert.deepEqual(history.map(row=>row.sessionDate),latest)
    const facts=financialFacts(artifacts.get('company-market-data'))
    const drift=Object.fromEntries(['companyAnalysis','industryAnalysis','investmentAdvice'].map(key=>[key,auditFinancialFacts(typeof data[key]==='string'?JSON.parse(data[key]):data[key],facts)]))
    const advice=typeof data.investmentAdvice==='string'?JSON.parse(data.investmentAdvice):data.investmentAdvice
    const products=normalizeAIProductDecisions(advice.productDecisions,data.researchEvaluation.decisions.map((row:{ticker:string})=>row.ticker))
    const semantic=products.flatMap(product=>decisionSemanticIssues(product).map(issue=>({ticker:product.ticker,issue})))
    const quality=applyExecutionQuality(data.reportQuality,advice,data.portfolioDecisionSupport,effectiveDecisionTiming(data.decisionTiming))
    if(products.every(product=>product.executionContract?.status!=='verified'))assert.equal(quality.executionReadinessScore,0)
    console.log(JSON.stringify({reportId:report.id,checks:{latestHistory:latest,promptBudgets:budgets,detectedArchivedFactIssues:drift,detectedArchivedSemanticIssues:semantic,dataReadiness:quality.dataReadinessScore,executionReadiness:quality.executionReadinessScore,executionAudit:quality.executionAudit},note:'只读回放：旧报告问题保留用于审计，没有改写历史正文'},null,2))
    if(process.argv.includes('--live')){
      const {marketAnalysisStep}=await import('../src/lib/workflow/steps/market-analysis-step')
      const {newsAnalysisStep}=await import('../src/lib/workflow/steps/news-analysis-step')
      const {companyAnalysisStep}=await import('../src/lib/workflow/steps/company-analysis-step')
      const {industryOverviewStep}=await import('../src/lib/workflow/steps/industry-overview-step')
      const {investmentAdviceStep}=await import('../src/lib/workflow/steps/investment-advice-step')
      const {socialReportStep}=await import('../src/lib/workflow/steps/social-report-step')
      const {buildPortfolioDecisionSupport}=await import('../src/lib/portfolio/decision-support')
      const {buildReportQuality}=await import('../src/lib/analysis/report-quality')
      const {fullResearchMarkdown}=await import('../src/lib/analysis/full-research-report')
      const {mkdir,writeFile,readFile}=await import('node:fs/promises')
      const {join}=await import('node:path')
      const started=Date.now(),execution:Array<{step:string;durationMs:number}>=[]
      const runStep=async(step:typeof marketAnalysisStep)=>{
        const at=Date.now(),saved=new Map<string,unknown>(),local=new Map(artifacts)
        const context:StepContext={...ctx,artifacts:local,stepId:step.name,
          saveArtifact:async(key,value)=>{local.set(key,value);saved.set(key,value)},
          updateProgress:async(_current,_total,message)=>{console.log(step.name,message||'')}}
        await step.execute(context)
        for(const [key,value] of saved){artifacts.set(key,value);artifacts.set(`${step.name}:${key}`,value)}
        execution.push({step:step.name,durationMs:Date.now()-at})
      }
      // The three primary modules depend only on the same frozen input.
      const resume=process.argv.find(arg=>arg.startsWith('--resume-live='))?.slice('--resume-live='.length)
      if(resume){
        const prior=JSON.parse(await readFile(resume,'utf8'))
        assert(prior.verificationOnly&&prior.sourceReportId===report.id,'只能复用同一冻结报告的已验证模块')
        const keys:Record<string,string>={'市场分析':'market-analysis','产业事件':'news-analysis','企业研究':'company-analysis','行业总览':'industry-overview'}
        for(const section of prior.sections){if(keys[section.title]){
          assert.deepEqual(auditFinancialFacts(typeof section.value==='string'?JSON.parse(section.value):section.value,facts),[])
          artifacts.set(keys[section.title],section.value)
        }}
      }else{
        const primary=await Promise.allSettled([marketAnalysisStep,newsAnalysisStep,companyAnalysisStep].map(runStep))
        const failed=primary.find(row=>row.status==='rejected')
        if(failed?.status==='rejected')throw failed.reason
        await runStep(industryOverviewStep)
      }
      for(const step of [investmentAdviceStep,socialReportStep])await runStep(step)
      const liveAdvice=JSON.parse(String(artifacts.get('investment-advice')))
      const portfolio=artifacts.get('portfolio-evidence') as Parameters<typeof buildPortfolioDecisionSupport>[0] & {holdings:unknown[];riskBudget:unknown;asOf:string;sourceAsOf:string} | undefined
      const support=portfolio&&'riskBudget' in portfolio&&portfolio.totalAssets?buildPortfolioDecisionSupport({evaluation:data.researchEvaluation,holdings:portfolio.holdings,totalAssets:portfolio.totalAssets,cashWeightPct:portfolio.cashWeightPct||0,policy:portfolio.riskBudget as Parameters<typeof buildPortfolioDecisionSupport>[0]['policy'],dataQualityAvailable:data.dataQuality?.status==='available',portfolioAsOf:portfolio.sourceAsOf||portfolio.asOf,investmentAdvice:liveAdvice}):null
      const liveQuality=buildReportQuality({evaluation:data.researchEvaluation,dataQuality:data.dataQuality,preflight:data.researchPreflight,decisionTiming:effectiveDecisionTiming(data.decisionTiming),investmentAdvice:liveAdvice,portfolioDecisionSupport:support})
      const sections=[['市场分析','market-analysis'],['产业事件','news-analysis'],['企业研究','company-analysis'],['行业总览','industry-overview'],['综合决策','investment-advice']].map(([title,key])=>({title,value:artifacts.get(key)}))
      for(const section of sections)assert.deepEqual(auditFinancialFacts(typeof section.value==='string'?JSON.parse(section.value):section.value,facts),[])
      assert(liveAdvice.productDecisions.length===data.researchEvaluation.decisions.length)
      const content=fullResearchMarkdown({title:'冻结样本优化验证',sections,actions:[],onePageAvailable:true,decisionTiming:effectiveDecisionTiming(data.decisionTiming)})
      assert(content.includes('综合决策'))
      const directory=join(process.cwd(),'.runtime','analysis-verification');await mkdir(directory,{recursive:true})
      const output=join(directory,`${Date.now()}.json`)
      await writeFile(output,JSON.stringify({sourceReportId:report.id,verificationOnly:true,sourceAsOf:data.researchEvaluation.asOf,generatedAt:new Date().toISOString(),wallMs:Date.now()-started,execution,reportQuality:liveQuality,sections,socialReport:artifacts.get('social-report'),portfolioDecisionSupport:support,content,artifacts:Object.fromEntries([...artifacts].filter(([key])=>key.includes(':ai-')||key.endsWith('-validation')||key.endsWith('-input-budget')))},null,2))
      console.log(JSON.stringify({liveValidation:'passed',output,wallMs:Date.now()-started,execution,executionReadiness:liveQuality.executionReadinessScore}))
    }
  }finally{await prisma.$disconnect()}
}
void main().catch(error=>{console.error(error instanceof Error?error.message:String(error));process.exitCode=1})
