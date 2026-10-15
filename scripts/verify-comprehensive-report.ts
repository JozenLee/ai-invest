import { reportIntegrityWarnings, auditDecisionEvidence } from '../src/lib/analysis/decision-audit'
/** Read-only acceptance checks against a real completed analysis, not a fixture. */
import type { Evaluation } from '../src/lib/research/contracts'
import type { PortfolioDecisionSupport } from '../src/lib/portfolio/decision-support'
import { config } from 'dotenv'
config({quiet:true})
async function main(){
  const runId=process.argv[2]
  if(!runId)throw new Error('请传入已完成的分析轮次编号')
  const {prisma}=await import('../src/lib/db/prisma')
  const {decisionEvents}=await import('../src/lib/analysis/report-insights')
  const {validateResearchOutput}=await import('../src/lib/workflow/research-output')
  try{
    const run=await prisma.executionRun.findUnique({where:{id:runId},include:{steps:{include:{artifacts:true}}}})
    if(!run||run.status!=='COMPLETED')throw new Error('分析轮次尚未成功完成')
    const artifacts=new Map(run.steps.flatMap(step=>step.artifacts.map(artifact=>{let value:unknown=artifact.data;try{value=JSON.parse(artifact.data||'null')}catch{}return [step.stepName+':'+artifact.artifactKey,value] as const})))
    const reportId=artifacts.get('generate-report:report-id')
    if(typeof reportId!=='string')throw new Error('缺少落库报告编号')
    const report=await prisma.aIAnalysisReport.findUnique({where:{id:reportId}})
    if(!report?.dataJson||!report.content.trim())throw new Error('报告落库为空')
    const data=JSON.parse(report.dataJson),evaluation=data.researchEvaluation as Evaluation
    const reviewMode=data.metadata?.kind==='review'
    const checks:Array<{name:string;passed:boolean;detail:string}>=[]
    const check=(name:string,passed:boolean,detail:string)=>checks.push({name,passed,detail})
    check('工作流闭环',run.steps.every(step=>['COMPLETED','SKIPPED'].includes(step.status)),`${run.steps.length}个步骤，报告 ${reportId}`)
    const reportQuality=data.reportQuality as {overallScore?:number;grade?:string;usability?:string;blockers?:string[];evidenceConfidenceScore?:number;decisionConfidenceScore?:number;executionReadinessScore?:number}|undefined
    const honestLimited=!!reportQuality?.blockers?.length&&reportQuality.usability==='limited-advice'&&Number(reportQuality.overallScore)<85
    const cleanAdvice=!reportQuality?.blockers?.length&&reportQuality?.usability==='advice-grade'&&Number(reportQuality.overallScore)>=85
    check('报告分级诚实',honestLimited||cleanAdvice,`${reportQuality?.overallScore??'缺失'}/100，${reportQuality?.grade||'未评级'}级，${reportQuality?.usability||'未分级'}；证据/决策/执行 ${reportQuality?.evidenceConfidenceScore??'—'}/${reportQuality?.decisionConfidenceScore??'—'}/${reportQuality?.executionReadinessScore??'—'}${reportQuality?.blockers?.length?`；${reportQuality.blockers.join('；')}`:''}`)
    const analysisStatuses=(data.analysisStatuses||{}) as Record<string,{status?:string;reason?:string}|null>
    const fallbacks=Object.entries(analysisStatuses).filter(([,value])=>value?.status==='fallback')
    check('无意外规则回退',fallbacks.length===0,fallbacks.length?fallbacks.map(([key,value])=>`${key}：${value?.reason||'降级'}`).join('；'):'全部智能节点均为真实模型输出或设计内确定性处理')
    const dataQuality=data.dataQuality as {status?:string;dataAnomalies?:unknown[]}|undefined
    const preflight=data.researchPreflight as {status?:string;failed?:number;warnings?:string[]}|undefined
    check('数据源有效',dataQuality?.status==='available'&&!(preflight?.failed||0)&&!(dataQuality?.dataAnomalies?.length||0),`数据门禁 ${dataQuality?.status||'缺失'}；同步失败 ${preflight?.failed||0}；异常 ${dataQuality?.dataAnomalies?.length||0}${preflight?.warnings?.length?`；${preflight.warnings.join('；')}`:''}`)
    for(const [stepName,key] of [['market-analysis','marketAnalysis'],['news-analysis','sentimentAnalysis'],['company-analysis','companyAnalysis'],['industry-overview','industryAnalysis'],['investment-advice','investmentAdvice']]){
      const value=data[key],text=typeof value==='string'?value:JSON.stringify(value)
      validateResearchOutput(text,stepName)
      const parsed=JSON.parse(text)
      const meaningful=typeof (parsed.analysis||parsed.thesis)==='string'&&(parsed.analysis||parsed.thesis).trim().length>0&&(stepName!=='company-analysis'||parsed.key_companies?.length>0)
      const requestStatuses=run.steps.find(step=>step.stepName===stepName)?.artifacts
        .filter(artifact=>artifact.artifactKey==='ai-request-status'||artifact.artifactKey.endsWith('-ai-request-status'))
        .map(artifact=>{try{return JSON.parse(artifact.data||'{}') as {status?:string;attempt?:number;usage?:{output_tokens?:number}}}catch{return {}}})||[]
      const executionStatus=artifacts.get(`${stepName}:${stepName}-ai-status`) as {status?:string;reason?:string}|undefined
      const completedRequests=requestStatuses.filter(status=>status.status==='completed'&&(status.usage?.output_tokens||0)>0)
      const modelCompleted=completedRequests.length>0
      const outputTokens=completedRequests.reduce((sum,status)=>sum+(status.usage?.output_tokens||0),0)
      const attempts=Math.max(0,...completedRequests.map(status=>status.attempt||0))
      const deterministic=executionStatus?.status==='deterministic'
      const inheritedReview=reviewMode&&data.inheritedFromReportId&&run.steps.find(step=>step.stepName===stepName)?.status==='SKIPPED'
      check(stepName,meaningful&&(modelCompleted||deterministic||inheritedReview),modelCompleted?`真实模型输出 ${outputTokens} tokens，${completedRequests.length}个请求，最多第${attempts}次成功`:deterministic?`确定性模块：${executionStatus?.reason||'按工作流定义执行'}`:inheritedReview?`规则复核按设计继承报告 ${data.inheritedFromReportId} 的已归档模型正文`:`执行状态 ${executionStatus?.status||requestStatuses.map(status=>status.status).join('、')||'缺失'}；正文结构 ${meaningful?'有效':'无效'}`)
    }
    check('同日折溢价',evaluation.decisions.every((decision)=>{const product=evaluation.products?.find((item)=>item.ticker===decision.ticker);return decision.metrics.premiumPct==null||product?.navDate===decision.metrics.date}),`${evaluation.decisions.filter((item)=>item.metrics.premiumPct!=null).length}/${evaluation.decisions.length}可计算；禁止跨日配对`)
    const unknown=evaluation.decisions.flatMap((item)=>item.conditions).filter((item)=>item.status==='unknown')
    check('未知与弱势分离',unknown.every((item)=>item.value===null),`${unknown.length}项未知，未填零；未满足条件单独保存`)
    check('同步状态与发布等待',!!data.researchPreflight&&Array.isArray(data.researchPreflight.publicationNotes),`同步 ${data.researchPreflight?.status}；发布说明 ${data.researchPreflight?.publicationNotes?.length||0}条`)
    const advice=typeof data.investmentAdvice==='string'?JSON.parse(data.investmentAdvice):data.investmentAdvice
    check('模型观点与规则分离',!!advice.recommendation&&!!advice.recommendationSource&&!!advice.ruleAssessment,'保留模型建议，单独记录规则约束')
    const integrityWarnings=reportIntegrityWarnings(data)
    check('数值、复权与动作一致性',integrityWarnings.length===0,integrityWarnings.join('；')||'未发现单位混用、复权缺口误述或摘要与产品动作冲突')
    const evidenceIssues=auditDecisionEvidence(advice,evaluation)
    check('逐产品证据绑定',evidenceIssues.length===0,evidenceIssues.map(item=>`${item.ticker}：${item.reason}`).join('；')||'每项产品观点均绑定本轮真实证据')
    check('复权状态可解释',evaluation.decisions.every(item=>!!item.adjustmentAudit),`${evaluation.decisions.filter(item=>!!item.adjustmentAudit).length}/${evaluation.decisions.length}保留因子覆盖与跳变统计`)
    const portfolio=data.portfolioDecisionSupport as PortfolioDecisionSupport|undefined
    check('阻断动作不输出金额',!portfolio||portfolio.actions.every(item=>item.executable||item.amount===null&&item.targetWeightPct===null),'不可执行动作的金额与目标仓位均为空')
    check('个人组合金额约束',!portfolio||portfolio.actions.every((item)=>item.mapping.verified||item.amount===null),'未核验映射不得出现精确调整金额')
    check('产品比较进入分析',!!evaluation.productComparisons?.length&&JSON.stringify(advice.productSelection)===JSON.stringify(evaluation.productComparisons),`${evaluation.productComparisons?.length||0}组冻结比较结果传入建议`)
    const market=typeof data.marketAnalysis==='string'?JSON.parse(data.marketAnalysis):data.marketAnalysis
    check('市场结构化展示',typeof market.analysis==='string'&&Array.isArray(market.dimensions)&&market.dimensions.length>0&&Array.isArray(market.evidence),'短判断、分维度说明、引用分开保存；页面布局另做浏览器验收')
    check('正文序列化',!report.content.split('\n').some(line=>/：\s+-\s+-/.test(line)),'嵌套列表独立换行，页面与归档使用同一分析字段')
    const baseline=evaluation.baselineReport
    const old=baseline?await prisma.aIAnalysisReport.findUnique({where:{id:baseline.id}}):null
    check('完整报告比较基线',!!old&&old.createdAt.getTime()<Date.parse(evaluation.asOf),baseline?.id||'无基线')
    const recall=artifacts.get('fetch-news:news-evidence-gaps') as {candidates:number;textRelevant:number;leads:number}|undefined
    check('事件召回与完整列表',!!recall&&recall.candidates===recall.textRelevant,`标签召回 ${recall?.candidates}；保留 ${evaluation.events.length}事件；决策 ${decisionEvents(evaluation,Number.MAX_SAFE_INTEGER).length}；线索 ${recall?.leads}`)
    console.log(JSON.stringify({runId,reportId,createdAt:report.createdAt,checks},null,2))
    if(checks.some(check=>!check.passed))process.exitCode=1
  }finally{await prisma.$disconnect()}
}
void main().catch(error=>{console.error(error instanceof Error?error.message:String(error));process.exitCode=1})
