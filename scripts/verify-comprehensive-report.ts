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
    const checks:Array<{name:string;passed:boolean;detail:string}>=[]
    const check=(name:string,passed:boolean,detail:string)=>checks.push({name,passed,detail})
    check('工作流闭环',run.steps.every(step=>['COMPLETED','SKIPPED'].includes(step.status)),`${run.steps.length}个步骤，报告 ${reportId}`)
    for(const [stepName,key] of [['market-analysis','marketAnalysis'],['news-analysis','sentimentAnalysis'],['company-analysis','companyAnalysis'],['industry-overview','industryAnalysis'],['investment-advice','investmentAdvice']]){
      const value=data[key],text=typeof value==='string'?value:JSON.stringify(value)
      validateResearchOutput(text,stepName)
      const parsed=JSON.parse(text)
      const meaningful=typeof (parsed.analysis||parsed.thesis)==='string'&&(parsed.analysis||parsed.thesis).trim().length>0&&(stepName!=='company-analysis'||parsed.key_companies?.length>0)
      const status=artifacts.get(stepName+':ai-request-status') as {status?:string;attempt?:number;usage?:{output_tokens?:number}}|undefined
      const executionStatus=artifacts.get(`${stepName}:${stepName}-ai-status`) as {status?:string;reason?:string}|undefined
      const modelCompleted=status?.status==='completed'&&(status.usage?.output_tokens||0)>0
      const deterministic=executionStatus?.status==='deterministic'
      check(stepName,meaningful&&(modelCompleted||deterministic),modelCompleted?`真实模型输出 ${status.usage!.output_tokens} tokens，第${status.attempt}次请求`:deterministic?`确定性模块：${executionStatus?.reason||'按工作流定义执行'}`:`执行状态 ${executionStatus?.status||status?.status||'缺失'}；正文结构 ${meaningful?'有效':'无效'}`)
    }
    check('同日折溢价',evaluation.decisions.every((decision)=>{const product=evaluation.products?.find((item)=>item.ticker===decision.ticker);return decision.metrics.premiumPct==null||product?.navDate===decision.metrics.date}),`${evaluation.decisions.filter((item)=>item.metrics.premiumPct!=null).length}/${evaluation.decisions.length}可计算；禁止跨日配对`)
    const unknown=evaluation.decisions.flatMap((item)=>item.conditions).filter((item)=>item.status==='unknown')
    check('未知与弱势分离',unknown.every((item)=>item.value===null),`${unknown.length}项未知，未填零；未满足条件单独保存`)
    check('同步状态与发布等待',!!data.researchPreflight&&Array.isArray(data.researchPreflight.publicationNotes),`同步 ${data.researchPreflight?.status}；发布说明 ${data.researchPreflight?.publicationNotes?.length||0}条`)
    const advice=typeof data.investmentAdvice==='string'?JSON.parse(data.investmentAdvice):data.investmentAdvice
    check('模型观点与规则分离',!!advice.recommendation&&!!advice.recommendationSource&&!!advice.ruleAssessment,'保留模型建议，单独记录规则约束')
    const portfolio=data.portfolioDecisionSupport as PortfolioDecisionSupport|undefined
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
