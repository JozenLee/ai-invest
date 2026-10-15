import type { Bar } from '../contracts'
import type { LabDataset } from './contracts'

/** Extend a rolling collection without mixing incompatible adjusted-price bases.
 * Newest vintage wins on overlap; old bars are rescaled only if overlap ratios agree.
 */
export function extendDataset(current:LabDataset,previous:LabDataset[]):LabDataset{
  const output=structuredClone(current)
  const extend=(newer:Bar[],older:Bar[])=>{
    const map=new Map(newer.map(b=>[b.date,b]))
    const overlap=older.filter(b=>map.has(b.date))
    if(!overlap.length)return newer
    const ratio=map.get(overlap.at(-1)!.date)!.close/overlap.at(-1)!.close
    if(overlap.some(b=>Math.abs(map.get(b.date)!.close/b.close/ratio-1)>1e-5))return newer
    for(const b of older)if(b.date<newer[0].date&&!map.has(b.date))map.set(b.date,{...b,open:b.open*ratio,high:b.high*ratio,low:b.low*ratio,close:b.close*ratio})
    return [...map.values()].sort((a,b)=>a.date.localeCompare(b.date))
  }
  for(const old of [...previous].sort((a,b)=>b.asOf.localeCompare(a.asOf))){
    if(old.benchmark!==current.benchmark||old.asOf>current.asOf)continue
    if(old.exclusions.length)output.limitations.push(`历史扩展记录仍有${old.exclusions.length}只产品缺少完整长序列；已有可核验短序列保留，不填充缺口。`)
    output.benchmarkBars=extend(output.benchmarkBars,old.benchmarkBars)
    for(const asset of output.assets){
      const prior=old.assets.find(a=>a.ticker===asset.ticker&&a.indexCode===asset.indexCode)
      if(prior){
        asset.bars=extend(asset.bars,prior.bars)
        const raw=new Map((asset.rawBars||[]).map(bar=>[bar.date,bar]))
        const first=asset.rawBars?.[0]?.date
        if(first)for(const bar of prior.rawBars||[])if(bar.date<first&&!raw.has(bar.date))raw.set(bar.date,bar)
        if(raw.size)asset.rawBars=[...raw.values()].sort((a,b)=>a.date.localeCompare(b.date))
        if(!asset.execution&&prior.execution)asset.execution=structuredClone(prior.execution)
        else if(asset.execution&&prior.execution){
          const {sessions:oldSessions,...oldRules}=prior.execution,{sessions,...rules}=asset.execution
          if(JSON.stringify(oldRules)===JSON.stringify(rules))asset.execution={...rules,sessions:{...oldSessions,...sessions}}
        }
      }
    }
  }
  output.limitations=[...new Set(output.limitations)]
  return output
}
