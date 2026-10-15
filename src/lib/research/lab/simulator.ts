import type { LabDataset, PaperFill, PaperResult, StrategySpec, TargetPlan } from './contracts'
import { annualVolatility, targetPlan } from './modules'
import { LAB_COSTS } from './contracts'

export type SimulationOptions = {
  mode: 'historical-reconstruction' | 'forward-paper' | 'buy-and-hold' | 'fixed-exposure'
  executionMode?:'economic'|'exchange'
  selectionNeutral?: boolean
  startDate?: string; endDate?: string; initialCapital?: number; plans?: TargetPlan[]
  costs?: typeof LAB_COSTS
}

/** One portfolio ledger for reconstructed rules and immutable forward targets.
 * Trades use the first subsequent observed open, never the signal's close.
 * Units are adjusted-price economic units, not executable exchange order quantities.
 */
export function simulatePortfolio(data: LabDataset, spec: StrategySpec, options: SimulationOptions): PaperResult {
  const capital = options.initialCapital ?? 100_000, costs = options.costs || LAB_COSTS
  if(!Number.isFinite(capital)||capital<=0||![costs.commissionBps,costs.slippageBps].every(n=>Number.isFinite(n)&&n>=0&&n<=1000))throw new Error('无效模拟资金或成本')
  const rate = (costs.commissionBps+costs.slippageBps)/10000
  const prices = new Map(data.assets.map(a=>[a.ticker,new Map(a.bars.map(b=>[b.date,b]))]))
  const allDates = data.benchmarkBars.map(b=>b.date).filter(date=>data.assets.length && data.assets.every(a=>prices.get(a.ticker)!.has(date)))
  const dates = allDates.filter(date=>(!options.startDate||date>=options.startDate)&&(!options.endDate||date<=options.endDate))
  const benchmark = new Map(data.benchmarkBars.map(b=>[b.date,b]))
  const result: PaperResult = {strategyId:spec.id,observations:0,trades:0,costs:0,turnover:0,returnPct:null,benchmarkReturnPct:null,excessReturnPct:null,maxDrawdownPct:null,recoverySessions:0,volatilityPct:null,equity:[],fills:[],skipped:[],attribution:[],latestTargets:{},halted:false}
  let cash=capital,peak=capital,drawdown=0,underwater=0,heldSessions=0,benchUnits=0,started=false
  const units:Record<string,number>={},netCash:Record<string,number>={},fees:Record<string,number>={}
  const lots:Record<string,Array<{units:number;session:number}>>={}
  const used=new Set<string>()
  const plans=[...(options.plans||[])].filter(p=>p.rebalance!==false&&p.strategyId===spec.id).sort((a,b)=>a.generatedAt.localeCompare(b.generatedAt))
  let lastTargets:Record<string,number>={}
  for(const date of dates){
    const openTime=Date.parse(`${date}T09:30:00+08:00`)
    const index=allDates.indexOf(date),previousDate=allDates[index-1]
    let plan:TargetPlan|undefined
    if(options.mode==='forward-paper'){
      const due=plans.filter(p=>!used.has(p.id)&&Date.parse(p.generatedAt)<openTime)
      due.forEach(p=>used.add(p.id))
      plan=due.at(-1)
      for(const superseded of due.slice(0,-1))result.skipped.push({planId:superseded.id,reason:'被开盘前更新的同策略计划取代'})
      if(plan && (Date.parse(plan.validUntil)<=openTime||!Number.isFinite(Date.parse(plan.validUntil))||plan.sourceDate>=date)){
        result.skipped.push({planId:plan.id,reason:'计划过期或引用了尚不可用的收盘数据'});plan=undefined
      }
      if(!started&&!plan)continue
    }else{
      if(index<61||!previousDate)continue
      if(options.mode==='buy-and-hold'&&!started||options.mode==='fixed-exposure'&&heldSessions%spec.rebalanceSessions===0){
        const indices=new Set<string>(),assets=data.assets.filter(a=>{if(indices.has(a.indexCode))return false;indices.add(a.indexCode);return true})
        plan={id:`hold:${date}`,strategyId:spec.id,generatedAt:`${previousDate}T15:30:00+08:00`,sourceDate:previousDate,validUntil:`${date}T15:00:00+08:00`,targets:Object.fromEntries(assets.map(a=>[a.ticker,(options.mode==='fixed-exposure'?spec.exposure:1)/assets.length])),features:[],reason:'同范围不同指数等权配置'}
      }else if(options.mode==='historical-reconstruction'&&heldSessions%spec.rebalanceSessions===0){
        plan=targetPlan(data,spec,previousDate,`${previousDate}T15:30:00+08:00`,`${date}T15:00:00+08:00`)
        if(options.selectionNeutral){
          const indices=new Set<string>(),assets=data.assets.filter(a=>{if(indices.has(a.indexCode))return false;indices.add(a.indexCode);return true})
          const exposure=Object.values(plan.targets).reduce((s,w)=>s+w,0)
          plan.targets=Object.fromEntries(assets.map(a=>[a.ticker,exposure/assets.length]))
        }
      }
    }
    if(!started){benchUnits=capital*(1-rate)/benchmark.get(date)!.open;started=true}
    // Drawdown observed at the previous close can only lead to an exit now.
    if(result.halted&&options.mode!=='buy-and-hold')plan={id:`risk-exit:${date}`,strategyId:spec.id,generatedAt:previousDate||date,sourceDate:previousDate||date,validUntil:`${date}T15:00:00+08:00`,targets:{},features:[],reason:'回撤预算触发；本实验余下期间停止新增风险'}
    if(plan){
      const entries=Object.entries(plan.targets)
      if(entries.some(([ticker,w])=>!prices.has(ticker)||!Number.isFinite(w)||w<0||w>1)||entries.reduce((s,[,w])=>s+w,0)>1+1e-8){
        result.skipped.push({planId:plan.id,reason:'仓位无效、标的未知或超出无杠杆预算'})
      }else{
        const nav=cash+data.assets.reduce((s,a)=>s+(units[a.ticker]||0)*prices.get(a.ticker)!.get(date)!.open,0)
        const orders=data.assets.map(a=>{const bar=prices.get(a.ticker)!.get(date)!;return {ticker:a.ticker,bar,asset:a,delta:plan!.decisions?.some(row=>row.ticker===a.ticker&&row.status==='missing')?0:(plan!.targets[a.ticker]||0)*nav-(units[a.ticker]||0)*bar.open}})
        const tradable=(order:typeof orders[number],side:'buy'|'sell')=>{
          if(order.bar.volume<=0||order.bar.amount<=0){result.skipped.push({planId:plan!.id,reason:`${order.ticker}无成交量，未成交`});return false}
          if(options.executionMode!=='exchange')return true
          const rules=order.asset.execution,session=rules?.sessions[date],raw=order.asset.rawBars?.find(bar=>bar.date===date)
          if(!rules||!raw||!session?.source||!Number.isFinite(Date.parse(session.availableAt))||Date.parse(session.availableAt)>openTime||!Number.isInteger(rules.lotSize)||rules.lotSize<1||!Number.isInteger(rules.settlementSessions)||rules.settlementSessions<0||!Number.isFinite(rules.minimumCommission)||rules.minimumCommission<0||!Number.isFinite(rules.maxParticipation)||rules.maxParticipation<=0||rules.maxParticipation>1){result.skipped.push({planId:plan!.id,reason:`${order.ticker}缺少历史交易限制、原始价格或执行规则，严格模式不成交`});return false}
          if(!(side==='buy'?session.canBuy:session.canSell)){result.skipped.push({planId:plan!.id,reason:`${order.ticker}历史停牌或涨跌停交易限制，${side==='buy'?'买入':'卖出'}未成交`});return false}
          return true
        }
        const fill=(order:typeof orders[number],notional:number)=>{
          if(Math.abs(notional)<capital*1e-8)return
          const rules=options.executionMode==='exchange'?order.asset.execution:undefined
          if(rules){
            const raw=order.asset.rawBars!.find(bar=>bar.date===date)!
            const priorRaw=order.asset.rawBars!.filter(bar=>bar.date<date).at(-1)
            const maximum=Math.min(raw.amount,priorRaw?.amount||0)*rules.maxParticipation
            let requested=Math.min(Math.abs(notional),maximum)
            if(notional<0){const settled=(lots[order.ticker]||[]).filter(lot=>index-lot.session>=rules.settlementSessions).reduce((sum,lot)=>sum+lot.units,0);requested=Math.min(requested,settled*order.bar.open)}
            else requested=Math.min(requested,Math.max(0,cash-rules.minimumCommission)/(1+rate))
            const rawUnits=Math.floor(requested/raw.open/rules.lotSize)*rules.lotSize
            notional=Math.sign(notional)*rawUnits*raw.open
            if(!notional){result.skipped.push({planId:plan!.id,reason:`${order.ticker}整手、交收或可用现金限制，本次未成交`});return}
          }
          const cost=rules?Math.max(Math.abs(notional)*costs.commissionBps/10000,rules.minimumCommission)+Math.abs(notional)*costs.slippageBps/10000:Math.abs(notional)*rate,qty=notional/order.bar.open
          if(rules){
            if(qty>0)(lots[order.ticker]??=[]).push({units:qty,session:index})
            else{let left=-qty;for(const lot of lots[order.ticker]||[]){if(index-lot.session<rules.settlementSessions)continue;const sold=Math.min(lot.units,left);lot.units-=sold;left-=sold}}
          }
          units[order.ticker]=(units[order.ticker]||0)+qty;cash-=notional+cost
          netCash[order.ticker]=(netCash[order.ticker]||0)+notional;fees[order.ticker]=(fees[order.ticker]||0)+cost
          const trade:PaperFill={planId:plan!.id,date,ticker:order.ticker,side:notional>0?'buy':'sell',units:Math.abs(qty),price:order.bar.open,notional:Math.abs(notional),cost,...(rules?{executionUnits:Math.abs(notional)/order.asset.rawBars!.find(bar=>bar.date===date)!.open,executionPrice:order.asset.rawBars!.find(bar=>bar.date===date)!.open}:{})}
          result.fills.push(trade);result.costs+=cost;result.turnover+=Math.abs(notional)/capital
        }
        // Cannot trade a zero-volume day; an unfilled reduction must not fund buys.
        for(const order of orders.filter(o=>o.delta<0)){
          if(!tradable(order,'sell'))continue
          fill(order,Math.max(order.delta,-(units[order.ticker]||0)*order.bar.open))
        }
        const buys=orders.filter(o=>o.delta>0&&tradable(o,'buy'))
        const wanted=buys.reduce((s,o)=>s+o.delta*(1+rate),0),scale=wanted?Math.min(1,Math.max(0,cash)/wanted):0
        for(const order of buys)fill(order,order.delta*scale)
        lastTargets=plan.targets
      }
    }
    const equity=cash+data.assets.reduce((s,a)=>s+(units[a.ticker]||0)*prices.get(a.ticker)!.get(date)!.close,0)
    peak=Math.max(peak,equity);drawdown=Math.max(drawdown,1-equity/peak)
    underwater=equity<peak-1e-7?underwater+1:0;result.recoverySessions=Math.max(result.recoverySessions,underwater)
    if(1-equity/peak>=spec.drawdownBudget&&options.mode!=='buy-and-hold')result.halted=true
    result.equity.push({date,equity,benchmark:benchUnits*benchmark.get(date)!.close,cashWeight:cash/equity});heldSessions++
  }
  const last=result.equity.at(-1)
  if(last){
    result.returnPct=(last.equity/capital-1)*100;result.benchmarkReturnPct=(last.benchmark/capital-1)*100
    result.excessReturnPct=result.returnPct-result.benchmarkReturnPct;result.maxDrawdownPct=drawdown*100
    result.attribution=data.assets.map(a=>({ticker:a.ticker,pnl:(units[a.ticker]||0)*prices.get(a.ticker)!.get(last.date)!.close-(netCash[a.ticker]||0)-(fees[a.ticker]||0),cost:fees[a.ticker]||0}))
    result.volatilityPct=(annualVolatility(result.equity.map(row=>({date:row.date,open:row.equity,high:row.equity,low:row.equity,close:row.equity,volume:0,amount:0})))??NaN)*100
    if(!Number.isFinite(result.volatilityPct))result.volatilityPct=null
  }
  result.observations=result.equity.length;result.trades=result.fills.length;result.latestTargets=lastTargets
  return result
}
