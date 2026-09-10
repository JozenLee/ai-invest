import type { ETFInput } from './contracts'
import { validBars } from './engine'

/** A tracking index is shared across products; ETF prices and factors never are. */
export function sharedIndexSeries(etfs:ETFInput[],cutoff:string|null){
 return etfs.map(etf=>{
  if(!etf.indexCode)return {etf,sourceTicker:etf.ticker}
  const candidates=etfs.filter(row=>row.indexCode===etf.indexCode).map(row=>({row,bars:validBars(row.indexBars,cutoff)})).sort((a,b)=>String(b.bars.at(-1)?.date||'').localeCompare(String(a.bars.at(-1)?.date||''))||b.bars.length-a.bars.length)
  const own=validBars(etf.indexBars,cutoff),best=candidates[0]
  if(!best||String(best.bars.at(-1)?.date||'')<=String(own.at(-1)?.date||'')&&best.bars.length<=own.length)return {etf,sourceTicker:etf.ticker}
  const merged=[...new Map(candidates.slice().reverse().flatMap(candidate=>candidate.bars).map(bar=>[bar.date,bar])).values()].sort((a,b)=>a.date.localeCompare(b.date))
  return {etf:{...etf,indexBars:merged},sourceTicker:best.row.ticker}
 })
}
