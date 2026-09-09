import type { Evaluation } from '@/lib/research/contracts'
import { ReportAnalysisView } from './ReportAnalysisView'
import { cleanClaim } from '@/lib/analysis/evidence-references'
import { reportCoverage } from '@/lib/analysis/report-insights'

export function parseAnalysis(value:unknown):Record<string,unknown>{
  if(value&&typeof value==='object'&&!Array.isArray(value))return value as Record<string,unknown>
  try{const parsed=JSON.parse(String(value||'{}'));return parsed&&typeof parsed==='object'&&!Array.isArray(parsed)?parsed:{analysis:String(value||'')}}catch{return {analysis:String(value||'')}}
}
export function MarketResearchView({value,evaluation,baseUrl}:{value:unknown;evaluation?:Evaluation;baseUrl:string}){
  const row=parseAnalysis(value),coverage=reportCoverage(evaluation),decisions=evaluation?.decisions||[]
  const liquid=decisions.filter(item=>item.conditions.find(condition=>condition.key==='liquidity')?.status==='met').length
  const summary=cleanClaim(String(row.analysis||'市场判断待生成'))
  const sentences=summary.match(/[^。！？]+[。！？]?/g)||[summary]
  const headline=sentences[0].length>100?sentences[0].slice(0,100)+'…':sentences[0]
  return <div className="space-y-4"><p className="text-base font-medium leading-7">{headline}</p><div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">{[
    ['指数广度',`${evaluation?.indexBreadth.aboveMA20||0}/${evaluation?.indexBreadth.usableIndices||0}`,'有效指数站上20日均线'],
    ['成交活跃度',`${liquid}/${decisions.length}`,'产品满足20日平均成交额门槛'],
    ['相对强度',`${coverage.signals.find(item=>item.key==='relative')?.met||0}/${coverage.indexCount}`,'有效指数强于基准'],
    ['领域资金',evaluation?.modules.flow?.status==='available'?'可计算':'待补齐',evaluation?.modules.flow?.detail||'资金证据未提供'],
  ].map(([label,value,detail])=><div key={label} className="rounded-lg bg-muted/40 p-4"><p className="text-xs text-muted-foreground">{label}</p><p className="mt-2 text-xl font-semibold">{value}</p><p className="mt-2 text-xs leading-5 text-muted-foreground">{detail}</p></div>)}</div>{summary!==headline&&<details><summary className="cursor-pointer text-sm text-primary">展开市场判断说明</summary><div className="mt-3 space-y-2">{sentences.map((sentence,index)=><p key={index} className="text-sm leading-7">{sentence}</p>)}</div></details>}<ReportAnalysisView value={Object.fromEntries(Object.entries(row).filter(([key])=>key!=='analysis'&&key!=='watchlist'))} sources={evaluation?.evidence} evidenceBaseUrl={baseUrl}/></div>
}
