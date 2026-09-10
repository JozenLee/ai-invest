import { adjustedBars, validBars } from './engine'
import { analysisSessionBoundary, chinaTimestamp, sessionBoundary } from './time'
import type { ResearchSnapshot } from './contracts'

export type TechnicalReadiness = ReturnType<typeof assessTechnicalReadiness>

/** References never change the evaluation cutoff or authorize current-session actions. */
export function assessTechnicalReadiness(snapshot: ResearchSnapshot) {
  const boundary=analysisSessionBoundary(snapshot.calendar,snapshot.asOf)
  const close=sessionBoundary(snapshot.calendar,snapshot.asOf).expectedSession
  const expected=boundary.expectedSession
  const sessions=snapshot.calendar.filter(day=>day.open&&expected&&day.date<=expected).map(day=>day.date).sort()
  const minimum=snapshot.profile.rules.minHistory
  const referenceCandidates=sessions.filter(day=>close&&day<=close).slice(-6).reverse()
  const openDates=new Set(sessions)
  const benchmark=validBars(snapshot.benchmarkBars,expected).filter(bar=>openDates.has(bar.date))
  const complete=(dates:Set<string>,end:string)=>{
    const required=sessions.filter(day=>day<=end).slice(-minimum)
    return required.length===minimum&&required.every(day=>dates.has(day))
  }
  const perEtf=snapshot.etfs.map(etf=>{
    const bars=validBars(etf.bars,expected).filter(bar=>openDates.has(bar.date)),factors=new Set(etf.factors.filter(row=>Number.isFinite(row.factor)&&row.factor>0).map(row=>row.date))
    const indexBars=validBars(etf.indexBars,expected)
    const dates=new Set(bars.map(row=>row.date)),indexDates=new Set(indexBars.map(row=>row.date))
    const current=adjustedBars({...etf,bars},expected)
    const indexExpected=boundary.intraday?close:expected
    const required=sessions.slice(-minimum)
    const missingSessions=required.filter(day=>!dates.has(day))
    const missingFactors=bars.filter(bar=>!factors.has(bar.date)).map(bar=>bar.date)
    const due=expected?`${expected}T17:00:00+08:00`:null
    const pending=!!due&&Date.parse(snapshot.asOf)<Date.parse(due)&&!boundary.intraday
    const issues:Array<{field:string;status:string;detail:string;action:string}>=[]
    const benchmarkComplete=!!expected&&complete(new Set(benchmark.map(bar=>bar.date)),expected)
    if(!benchmarkComplete)issues.push({field:'benchmark',status:'stale',detail:`基准最新日 ${benchmark.at(-1)?.date||'缺失'}，尚无完整同日序列`,action:'补齐市场基准的同日行情与历史交易日序列'})
    if(!etf.indexCode)issues.push({field:'index',status:'missing',detail:'正式跟踪指数映射缺失',action:'按基金合同核验跟踪指数，不按产品名称推断'})
    if(!expected||!boundary.verified)issues.push({field:'calendar',status:'missing',detail:'交易日历无法确认研究日',action:'更新交易日历后重新冻结'})
    if(missingSessions.length)issues.push({field:'daily',status:bars.length?'stale':'missing',detail:`缺少日线：${missingSessions.join('、')}`,action:'在数据订阅补齐对应交易日日线后新建复核'})
    if(missingFactors.length||!etf.adjustmentSource)issues.push({field:'factors',status:pending&&missingFactors.length===1&&missingFactors[0]===expected?'pending-publication':factors.size?'stale':'missing',detail:!etf.adjustmentSource?'缺少可追溯复权来源':`缺少复权因子：${missingFactors.join('、')}`,action:pending?'基金复权因子通常17:00后发布，发布后由订阅服务补采并重新冻结':'补齐同日正式复权因子；不得沿用昨日因子冒充今日数据'})
    if(current.adjusted&&current.discontinuity)issues.push({field:'continuity',status:'invalid',detail:'复权后价格仍存在超过30%的断点',action:'核验分拆、分红及原始价格，不跨断点计算'})
    if(!indexExpected||!complete(indexDates,indexExpected))issues.push({field:'indexDaily',status:indexBars.length?'stale':'missing',detail:`跟踪指数最新日 ${indexBars.at(-1)?.date||'缺失'}；要求 ${indexExpected||'待确认'}`,action:'补齐正式跟踪指数日线，再计算指数趋势与相对收益'})
    for(const issue of issues){const source=etf.fieldStatus?.[issue.field];if(source?.status==='failed'){issue.status='failed';issue.detail+=`；${source.detail||'上游请求失败'}`}}
    const usable=!!expected&&boundary.verified&&!!etf.indexCode&&bars.length>=minimum&&missingSessions.length===0&&current.adjusted&&!current.discontinuity
    const referenceDate=referenceCandidates.find(day=>snapshot.etfs.every(product=>{
      const series=adjustedBars(product,day)
      return series.adjusted&&!series.discontinuity&&complete(new Set(series.bars.map(bar=>bar.date)),day)&&complete(new Set(validBars(product.indexBars,day).map(bar=>bar.date)),day)
    })&&complete(new Set(benchmark.map(bar=>bar.date)),day))||null
    const referenceSeries=referenceDate?adjustedBars(etf,referenceDate).bars:[]
    const mean=(n:number)=>referenceSeries.length>=n?referenceSeries.slice(-n).reduce((sum,bar)=>sum+bar.close,0)/n:null
    const last=referenceSeries.at(-1)
    const reference=referenceDate?{date:referenceDate,close:last?.close??null,ma20:mean(20),ma60:mean(60),return20Pct:referenceSeries.length>20?(last!.close/referenceSeries.at(-21)!.close-1)*100:null,executionReady:false,basis:'所有产品、复权因子、跟踪指数与基准共同完整的最近交易日；仅作历史参考，不替代当期门禁'}:null
    return {ticker:etf.ticker,name:etf.name,usable,latestPriceDate:bars.at(-1)?.date||null,latestFactorDate:[...factors].filter(day=>!!expected&&day<=expected).sort().at(-1)||null,latestIndexDate:indexBars.at(-1)?.date||null,issues,reference}
  })
  return {asOf:chinaTimestamp(snapshot.asOf),expectedSession:expected,usable:perEtf.filter(row=>row.usable).length,requested:perEtf.length,referenceSession:perEtf[0]?.reference?.date||null,perEtf,boundary:'当期技术可用率与历史参考分开；行情、因子和指数全部补齐后，须新建复核版本才能更新报告。'}
}
