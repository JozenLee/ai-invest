import { chinaDate } from './time'
import type { ResearchSnapshot } from './contracts'
import { adjustedBars, validBars } from './engine'
export type ArchivedForecast = {ticker:string;generatedAt:string;target:string;horizonTradingDays:number;probability:number}
/** Only an explicitly defined probability is calibratable. Confidence and data
 * coverage scores must never be reinterpreted as probabilities of excess return. */
export function calibrateForecasts(forecasts:ArchivedForecast[],snapshot:ResearchSnapshot,horizonDays:number){
  const samples:Array<{ticker:string;asOf:string;probability:number;outcome:0|1;excessReturnPct:number}>=[]
  let pendingOutcomes=0,rejectedForecasts=0
  const seen=new Set<string>()
  const benchmark=validBars(snapshot.benchmarkBars,chinaDate(snapshot.asOf))
  for(const forecast of [...forecasts].sort((a,b)=>a.generatedAt.localeCompare(b.generatedAt))){
    if(forecast.target!=='outperform-benchmark'||forecast.horizonTradingDays!==horizonDays||!Number.isFinite(forecast.probability)||forecast.probability<0||forecast.probability>1||!Number.isFinite(Date.parse(forecast.generatedAt))||Date.parse(forecast.generatedAt)>=Date.parse(snapshot.asOf)){rejectedForecasts++;continue}
    const etf=snapshot.etfs.find(item=>item.ticker===forecast.ticker)
    if(!etf){rejectedForecasts++;continue}
    const adjusted=adjustedBars(etf,chinaDate(snapshot.asOf))
    if(!adjusted.adjusted||adjusted.discontinuity){rejectedForecasts++;continue}
    const start=adjusted.bars.findIndex(bar=>Date.parse(`${bar.date}T09:30:00+08:00`)>Date.parse(forecast.generatedAt))
    if(start<0){pendingOutcomes++;continue}
    const first=adjusted.bars[start],last=adjusted.bars[start+horizonDays-1]
    const key=`${forecast.ticker}:${first.date}`
    if(seen.has(key))continue
    seen.add(key)
    if(!last){pendingOutcomes++;continue}
    const bFirst=benchmark.find(bar=>bar.date===first.date),bLast=benchmark.find(bar=>bar.date===last.date)
    if(!bFirst||!bLast){pendingOutcomes++;continue}
    const excessReturnPct=((last.close/first.open-1)-(bLast.close/bFirst.open-1))*100
    samples.push({ticker:forecast.ticker,asOf:first.date,probability:forecast.probability,outcome:excessReturnPct>0?1:0,excessReturnPct})
  }
  const minimumOutcomes=30,ready=samples.length>=minimumOutcomes
  return {status:ready?'calibrated' as const:'insufficient-outcomes' as const,horizonTradingDays:horizonDays,minimumOutcomes,maturedOutcomes:samples.length,pendingOutcomes,rejectedForecasts,
    brierScore:ready?samples.reduce((sum,item)=>sum+(item.probability-item.outcome)**2,0)/samples.length:null,
    hitRatePct:ready?samples.filter(item=>(item.probability>=.5)===(item.outcome===1)).length/samples.length*100:null,
    samples:samples.slice(-30),basis:'仅校准明确声明未来区间超额概率的预测；按报告生成后的下一开盘起算，同产品同起算日去重；小样本不展示命中率。'}
}
