import { compactSocialReport, REPORT_SECTIONS, type SocialReport } from '@/lib/analysis/social-report'
import { representativeProducts } from '@/lib/analysis/report-insights'
import type { StepContext, StepDefinition } from '../types'

function parsed(value:unknown):Record<string,any>{
  if(value&&typeof value==='object')return value as Record<string,any>
  try{return JSON.parse(String(value||'{}').replace(/^```(?:json)?\s*/,'').replace(/\s*```$/,''))}catch{return {}}
}
function prose(value:unknown):string{
  if(typeof value==='string')return value
  if(Array.isArray(value))return value.map(prose).filter(Boolean).join('；')
  if(value&&typeof value==='object')return Object.values(value).map(prose).filter(Boolean).join('；')
  return ''
}
function first(value:unknown,fallback:string){return prose(value).split(/(?<=[。！？；])/u).find(Boolean)||fallback}
function cited(value:Record<string,any>,fallback:string){
  const evidence=Array.isArray(value.evidence)?value.evidence:[]
  const item=evidence.find((candidate:any)=>/收入|利润|现金流|订单|出货|毛利率|产能/u.test(String(candidate?.claim||'')))||evidence[0]
  return item?.claim?`${item.date||'日期待核验'}｜${item.source||'来源待核验'}：${item.claim}`:first(value.analysis,fallback)
}
function scenario(value:unknown){return prose(value).replace(/[。；;]+$/u,'')||'待核验'}
function companyHighlight(company:Record<string,any>){
  const item=Array.isArray(company.key_companies)?company.key_companies[0]:null
  return item?.fact?`【${item.evidence||'来源待核验'}】${item.company||item.name||'代表企业'}：${item.fact}`:cited(company,'企业盈利质量证据不足。')
}

function buildSocialReport(context:StepContext):SocialReport{
  const industry=parsed(context.artifacts.get('industry-info')),market=parsed(context.artifacts.get('market-analysis')),company=parsed(context.artifacts.get('company-analysis'))
  const news=parsed(context.artifacts.get('news-analysis')),overview=parsed(context.artifacts.get('industry-overview')),investment=parsed(context.artifacts.get('investment-advice'))
  const evaluation=context.artifacts.get('research-evaluation'),decisions=evaluation?.decisions||[],riskOff=decisions.filter((item:any)=>item.state==='risk-off').length,eligible=decisions.filter((item:any)=>item.state==='eligible').length
  const scenarios=investment.scenarios||{},valuationCount=(evaluation?.products||[]).filter((item:any)=>Number.isFinite(item.pe)||Number.isFinite(item.pb)).length
  const draft={version:2 as const,title:`${industry.name||'产业'}ETF观察`,subtitle:first(overview.analysis||investment.thesis,'产业与市场证据已完成交叉复核。'),takeaways:[
    `产业：${overview.stage||'阶段待核验'}，盈利质量仍需持续验证。`,
    `战术：${riskOff}只风险收缩，${eligible}只满足实验条件。`,
    `估值：${valuationCount}只产品有底层数据，仍为观察级。`,
  ],sections:[
    {title:REPORT_SECTIONS[0],body:cited(news,first(overview.drivers||overview.analysis,'产业驱动证据不足。'))},
    {title:REPORT_SECTIONS[1],body:companyHighlight(company)},
    {title:REPORT_SECTIONS[2],body:cited(market,'市场与估值证据不足。')},
    {title:REPORT_SECTIONS[3],body:`覆盖${decisions.length}只A股ETF、${evaluation?.indexBreadth?.mappedIndices||0}个跟踪指数；同指数产品按费率、流动性、净值时点和跟踪误差比较，异常值不参与选优。`},
    {title:REPORT_SECTIONS[4],body:`基准：${scenario(scenarios.base?.conditions||scenarios.base)}；上行：${scenario(scenarios.bull?.conditions||scenarios.bull)}；下行：${scenario(scenarios.bear?.conditions||scenarios.bear)}。`},
    {title:REPORT_SECTIONS[5],body:first(investment.watchlist||news.watchlist,'跟踪订单、盈利、现金流、资金和趋势条件。')},
  ],risks:(Array.isArray(investment.risks)?investment.risks:[]).map(prose).filter(Boolean).slice(0,3)}
  while(draft.risks.length<3)draft.risks.push(['数据缺失不补零，未验证规则不形成交易指令。','历史持仓披露与实时指数暴露可能存在偏差。','历史研究和模拟回放不保证未来收益。'][draft.risks.length])
  return compactSocialReport(JSON.stringify(draft))
}

export const socialReportStep: StepDefinition = {
  name:'social-report',description:'标准化一页产业研究报告',dependencies:['industry-overview','investment-advice'],estimatedDuration:1000,
  async execute(context){
    await context.updateProgress(0,1,'正在根据已验证分析生成一页版')
    const report=buildSocialReport(context)
    const etfs:Array<{changePct:number;dataDate:string;name?:string;ticker:string;source?:string}>=context.artifacts.get('etf-market-data')||[]
    const representativeTickers=representativeProducts(context.artifacts.get('research-evaluation')).map(item=>item.ticker)
    const representatives=representativeTickers.map(ticker=>etfs.find(row=>row.ticker===ticker)).filter((row):row is typeof etfs[number]=>!!row)
    report.metrics=(representatives.length?representatives:etfs).filter(row=>Number.isFinite(row.changePct)&&row.dataDate).slice(0,3).map(row=>({label:row.name||row.ticker,value:(row.changePct>0?'+':'')+row.changePct.toFixed(2)+'%',date:String(row.dataDate).slice(0,10),source:row.source||'订阅数据库（来源未标注）'}))
    await context.saveArtifact('social-report',report,'DATA')
    await context.saveArtifact('social-report-status',{status:'ready',attempts:0,compacted:true,errors:[],message:'由已验证的分层分析确定性编辑，未重复调用模型'},'DATA')
    await context.updateProgress(1,1,'一页报告已完成确定性编辑与容量校验')
  },
}
