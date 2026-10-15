import type { Evaluation } from './contracts'
const datasets:Record<string,string>={calendar:'research_calendar',session:'etf_research',history:'etf_research',continuity:'etf_research',adjustment:'etf_research',index:'etf_research',premium:'etf_research',spread:'etf_research',volatility:'etf_research',fundamentals:'stock_financial',holdings:'etf_holdings','profit-growth':'stock_financial','cash-quality':'stock_financial'}
/** Missing evidence is a collection task; failed investment signals are not. */
export function dataRemediationPlan(evaluation: Evaluation) {
  const groups = new Map<string,{dataset:string;condition:string;label:string;tickers:string[];priority:'critical'|'normal';reason:string}>()
  for(const decision of evaluation.decisions)for(const condition of decision.conditions){
    if(condition.status!=='unknown')continue
    const key=condition.key,dataset=datasets[key]||'manual-review'
    const item=groups.get(key)||{dataset,condition:key,label:condition.label,tickers:[],priority:['calendar','session','history','continuity','adjustment','index','premium','spread'].includes(key)?'critical' as const:'normal' as const,reason:'重新同步并核验业务日期、来源与单位；不得填零或将数据缺口解释为市场弱势'}
    item.tickers.push(decision.ticker);groups.set(key,item)
  }
  const missingFees=(evaluation.products||[]).filter(product=>product.feePct==null).map(product=>product.ticker)
  if(missingFees.length)groups.set('management-fee',{dataset:'etf_research',condition:'management-fee',label:'ETF管理费',tickers:missingFees,priority:'normal',reason:'通过fund_basic.m_fee补齐并核验证券代码；不从etf_basic猜测，不把缺失当作零费率'})
  return [...groups.values()].sort((a,b)=>Number(b.priority==='critical')-Number(a.priority==='critical')||b.tickers.length-a.tickers.length)
}
