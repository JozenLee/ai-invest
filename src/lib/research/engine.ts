import type { Bar, Condition, Decision, ETFInput, Evaluation, ResearchSnapshot } from './contracts'
import { dateKey, nextReview, sessionBoundary } from './time'

const mean = (values: number[]) => values.length ? values.reduce((a,b)=>a+b,0)/values.length : null
const finite = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value)
export function validBars(rows: Bar[], cutoff: string | null) {
  return [...new Map(rows.filter(b=>dateKey(b.date) && cutoff && b.date <= cutoff && [b.open,b.high,b.low,b.close].every(n=>finite(n)&&n>0) && b.high >= Math.max(b.open,b.close) && b.low <= Math.min(b.open,b.close) && finite(b.amount)&&b.amount>=0 && finite(b.volume)&&b.volume>=0).map(b=>[b.date,b])).values()].sort((a,b)=>a.date.localeCompare(b.date))
}
export function adjustedBars(etf: ETFInput, cutoff: string | null) {
  const raw = validBars(etf.bars, cutoff)
  const factors = new Map(etf.factors.filter(f=>dateKey(f.date)&&finite(f.factor)&&f.factor>0).map(f=>[f.date,f.factor]))
  const complete = !!raw.length && raw.every(b=>factors.has(b.date)) && !!etf.adjustmentSource
  const base = factors.get(raw.at(-1)?.date || '') || 1
  const bars = complete ? raw.map(b=>{ const ratio=factors.get(b.date)!/base; return {...b,open:b.open*ratio,high:b.high*ratio,low:b.low*ratio,close:b.close*ratio} }) : raw
  const discontinuity = bars.some((b,i)=>i>0&&Math.abs(b.close/bars[i-1].close-1)>0.3)
  return {raw,bars,adjusted:complete,discontinuity}
}
function returns(bars: Bar[]) { return bars.slice(1).map((b,i)=>b.close/bars[i].close-1) }
function std(values: number[]) { const m=mean(values); return m!==null&&values.length>1?Math.sqrt(values.reduce((s,v)=>s+(v-m)**2,0)/(values.length-1)):null }
function change(bars: Bar[], n: number) { return bars.length>n ? (bars.at(-1)!.close/bars.at(-n-1)!.close-1)*100 : null }
function condition(key: string,label: string,value: number|string|null,operator: Condition['operator'],threshold: number|string,evidenceIds: string[]): Condition {
  const known = value!==null && (typeof value !== 'number' || Number.isFinite(value))
  const met = known && (operator==='='?value===threshold:operator==='>='?value>=threshold:value<=threshold)
  return {key,label,value,operator,threshold,status:!known?'unknown':met?'met':'unmet',evidenceIds}
}
export function evaluateResearch(snapshot: ResearchSnapshot, previous?: Evaluation | null): Evaluation {
  const boundary=sessionBoundary(snapshot.calendar,snapshot.asOf), cutoff=boundary.expectedSession
  const openDates=new Set(snapshot.calendar.filter(c=>c.open).map(c=>c.date))
  const benchmark=validBars(snapshot.benchmarkBars,cutoff).filter(b=>openDates.has(b.date))
  const profile=snapshot.profile, rules=profile.rules
  const sessions=snapshot.calendar.filter(c=>c.open && cutoff && c.date<=cutoff).map(c=>c.date).sort()
  const flowSessions=sessions.slice(-rules.flowDays)
  // A partial sector/day must not look like the whole configured domain.
  const flowByKey=new Map(snapshot.sectorFlows.filter(f=>finite(f.net)).map(f=>[f.date+':'+f.sector,f]))
  const flowComplete=profile.sectors.length>0 && flowSessions.length===rules.flowDays && flowSessions.every(d=>profile.sectors.every(s=>flowByKey.has(d+':'+s)))
  const flows=flowSessions.flatMap(d=>profile.sectors.flatMap(s=>flowByKey.has(d+':'+s)?[flowByKey.get(d+':'+s)!]:[]))
  const flowSum=flowComplete?flows.reduce((sum,f)=>sum+f.net,0):null
  const flowNetPct=flowComplete&&flows.every(flow=>finite(flow.netPct))?mean(flows.map(flow=>flow.netPct!)):null
  const flowIds=[...new Set(flows.map(f=>f.evidenceId))]
  const expiry=nextReview(snapshot.calendar,snapshot.asOf)
  let decisions=snapshot.etfs.map((etf):Decision=>{
    const {raw,bars,adjusted,discontinuity}=adjustedBars({...etf,bars:etf.bars.filter(b=>openDates.has(b.date))},cutoff)
    const indices=validBars(etf.indexBars,cutoff).filter(b=>openDates.has(b.date)), date=raw.at(-1)?.date||null
    const current=raw.at(-1)?.close||null, p=etf.product
    const expectedDates=sessions.slice(-rules.minHistory)
    const complete=(series:Bar[])=>{const dates=new Set(series.map(b=>b.date));return expectedDates.length===rules.minHistory&&expectedDates.every(d=>dates.has(d))}
    const usable=bars.length>=rules.minHistory && complete(bars) && adjusted && !discontinuity && date===cutoff && cutoff!==null
    const ma20=usable?mean(bars.slice(-20).map(b=>b.close)):null
    const ma60=usable?mean(bars.slice(-60).map(b=>b.close)):null
    const volatility=usable?std(returns(bars)):null
    const ret=usable?change(bars,20):null
    const indexValid=indices.length>=rules.minHistory && complete(indices) && indices.at(-1)?.date===cutoff
    const benchmarkValid=benchmark.length>=rules.minHistory && complete(benchmark) && benchmark.at(-1)?.date===cutoff
    // Compare identical sessions, never independently sliced missing-day sequences.
    const pairDates=sessions.slice(-21)
    const iMap=new Map(indices.map(b=>[b.date,b])), bMap=new Map(benchmark.map(b=>[b.date,b]))
    const aligned=indexValid&&benchmarkValid&&pairDates.length===21&&pairDates.every(d=>iMap.has(d)&&bMap.has(d))
    const rs=aligned?change(pairDates.map(d=>iMap.get(d)!),20)!-change(pairDates.map(d=>bMap.get(d)!),20)!:null
    const productCurrent=p.date===cutoff&&cutoff!==null
    const premium=productCurrent&&finite(p.nav)&&p.nav>0&&current?(current/p.nav-1)*100:null
    const amount=raw.length>=20&&date===cutoff?mean(raw.slice(-20).map(b=>b.amount)):null
    const confirmed=usable&&indexValid ? Array.from({length:rules.entryConfirmDays},(_,i)=>{
      const sample=indices.slice(0,indices.length-i); return sample.at(-1)!.close>mean(sample.slice(-20).map(b=>b.close))!
    }).every(Boolean):null
    const benchmarkTrend=benchmarkValid?benchmark.at(-1)!.close/mean(benchmark.slice(-60).map(b=>b.close))!-1:null
    const holdingsKnown=etf.holdings.length>0&&new Set(etf.holdings.map(h=>h.period)).size===1&&etf.holdings.every(h=>h.period&&h.publishedAt&&dateKey(h.period)!<=cutoff!&&Date.parse(snapshot.asOf)-Date.parse(h.period)<190*86400000&&Date.parse(h.publishedAt)<=Date.parse(snapshot.asOf)&&finite(h.weight)&&h.weight>=0&&h.weight<=100)&&etf.holdings.reduce((s,h)=>s+(h.weight||0),0)<=100.5
    const weight=holdingsKnown?etf.holdings.reduce((s,h)=>s+h.weight!,0):null
    // A decision cites representative records, not every raw bundle ever fetched for the product.
    const priceEvidenceIds=etf.evidenceIds.slice(0,12)
    const conditions=[
      condition('calendar','交易日历已核验',boundary.verified?'yes':null,'=','yes',snapshot.evidence.filter(e=>e.source.includes('trade_cal')).map(e=>e.id)),
      condition('session','收盘行情对齐',date,'=',cutoff||'unknown',priceEvidenceIds),
      condition('history','有效历史样本',bars.length,'>=',rules.minHistory,priceEvidenceIds),
      condition('continuity','交易日序列完整',complete(bars)?'yes':null,'=','yes',priceEvidenceIds),
      condition('adjustment','完整复权因子且序列连续',adjusted&&!discontinuity?'yes':null,'=','yes',priceEvidenceIds),
      condition('index','正式跟踪指数映射',etf.indexCode?'yes':null,'=','yes',priceEvidenceIds),
      condition('market','基准高于60日均线',benchmarkTrend,'>=',0,priceEvidenceIds),
      condition('trend','指数连续站上20日均线',confirmed===null?null:confirmed?rules.entryConfirmDays:0,'>=',rules.entryConfirmDays,priceEvidenceIds),
      condition('relative','指数20日相对基准收益(百分点)',rs,'>=',0,priceEvidenceIds),
      condition('flow','领域多日主力净占比均值(%，交易分类非新增资金)',flowNetPct,'>=',0,flowIds),
      condition('premium','指数基金绝对折溢价(%)',premium===null?null:Math.abs(premium),'<=',rules.maxPremiumPct,p.evidenceIds),
      condition('liquidity','20日平均成交额(元)',amount,'>=',rules.minDailyAmount,priceEvidenceIds),
      condition('spread','买卖价差（基点，同日快照）',productCurrent&&p.bookDate===cutoff?p.spreadBps:null,'<=',rules.maxSpreadBps,p.evidenceIds),
      condition('volatility','年化波动率(%)',volatility===null?null:volatility*Math.sqrt(252)*100,'<=',rules.maxVolatilityPct,priceEvidenceIds),
      condition('holdings','已披露持仓权重覆盖(%，不是实时穿透)',weight,'>=',50,etf.holdings.map(h=>h.evidenceId)),
    ]
    const critical=['calendar','session','history','continuity','adjustment','index']
    const blocked=conditions.some(c=>critical.includes(c.key)&&c.status!=='met')
    const riskSignals=[
      conditions.find(c=>c.key==='market')?.status==='unmet',
      usable&&bars.at(-1)!.close<ma60!,
      indexValid&&indices.at(-1)!.close<mean(indices.slice(-20).map(row=>row.close))!,
    ]
    // A broad-market moving average alone must never turn every sector product into the same exit signal.
    const riskOff=!blocked && riskSignals.filter(Boolean).length>=2
    const related=new Set(etf.holdings.map(h=>h.code))
    const risks=snapshot.events.filter(e=>e.category==='risk'&&e.status==='evidence'&&e.companies.some(c=>related.has(c)))
    conditions.push(condition('event-risk','重大风险事件待人工复核',risks.length?'yes':'no','=','no',risks.flatMap(e=>e.evidenceIds).slice(0,24)))
    // Company and event availability are independent gates, not a count hidden in metadata.
    const covered=snapshot.companies.filter(c=>related.has(c.code))
    const financialCoverage=covered.length?covered.filter(c=>c.financialPeriods>=2).length/covered.length*100:null
    const companyEvidenceIds=covered.flatMap(c=>c.evidenceIds).slice(0,24)
    conditions.push(condition('fundamentals','持仓企业多期财报覆盖(%)',financialCoverage,'>=',80,companyEvidenceIds))
    const weightedFinancial=(field:'profitGrowthPct'|'cashConversionPct')=>{
      if(weight===null||weight<=0)return null
      const rows=etf.holdings.flatMap(h=>{const company=covered.find(c=>c.code===h.code),value=company?.[field];return finite(value)&&h.weight!==null?[{value,weight:h.weight}]:[]})
      const knownWeight=rows.reduce((n,r)=>n+r.weight,0)
      return knownWeight>=weight*0.8?rows.reduce((n,r)=>n+r.value*r.weight,0)/knownWeight:null
    }
    conditions.push(condition('profit-growth','披露持仓加权利润同比(%，同币种同报告期)',weightedFinancial('profitGrowthPct'),'>=',0,companyEvidenceIds))
    conditions.push(condition('cash-quality','披露持仓加权经营现金/利润(%)',weightedFinancial('cashConversionPct'),'>=',50,companyEvidenceIds))
    const sectorEvents=snapshot.events.filter(e=>e.status==='evidence'&&e.category!=='administrative')
    conditions.push(condition('events','有效产业事件证据',sectorEvents.length?1:null,'>=',1,sectorEvents.slice(0,12).flatMap(e=>e.evidenceIds).slice(0,24)))
    const state=blocked?'blocked':riskOff?'risk-off':conditions.every(c=>c.status==='met')?'eligible':'watch'
    const gaps=conditions.filter(c=>c.status!=='met').map(c=>`${c.label}：${c.status==='unknown'?'证据缺失或口径未核验':'未满足条件'}`)
    const evidenceIds=[...new Set(conditions.flatMap(c=>c.evidenceIds))]
    const navMap=new Map((etf.navHistory||[]).filter(n=>n.date<=cutoff!&&finite(n.nav)&&n.nav>0).map(n=>[n.date,n.nav]))
    const trackingDates=sessions.slice(-61)
    const trackingDiff=trackingDates.slice(1).flatMap((d,i)=>{const before=trackingDates[i];return navMap.has(d)&&navMap.has(before)&&iMap.has(d)&&iMap.has(before)?[navMap.get(d)!/navMap.get(before)!-iMap.get(d)!.close/iMap.get(before)!.close]:[]})
    const tracking=trackingDiff.length>=20?std(trackingDiff):null
    const ruleAction={unheld:state==='eligible'?'建仓' as const:'观望' as const,held:state==='eligible'?'持有' as const:state==='risk-off'?'减仓' as const:'观望' as const}
    return {ticker:etf.ticker,name:etf.name,indexCode:etf.indexCode,state,unheldAction:'观望' as const,heldAction:'观望' as const,ruleAction,researchOnly:true,
      reason:state==='eligible'?'实验规则全部满足，仅作为模拟跟踪候选；样本外验证通过前不形成建仓指令。':state==='risk-off'?'已核验价格或市场条件触发风险复核；样本外验证通过且取得组合风险预算前，不直接给出减仓指令。':gaps.join('；'),
      trigger:`规则版本1：连续${rules.entryConfirmDays}日指数趋势确认、相对强度、${rules.flowDays}日资金及全部产品/证据门禁同时满足。`,
      invalidation:'基准或ETF跌破60日均线、重大事件风险、任一关键数据失效；新事件需人工核验，不自动清仓。',horizon:`${profile.horizonDays}个交易日，盘后复核，次日盘前过期`,evidence:evidenceIds.map(id=>{const e=snapshot.evidence.find(e=>e.id===id);return e?`${id} · ${e.source} · ${e.dataDate||e.publishedAt||'日期未知'}`:id}),
      conditions,gaps,evidenceIds,expiresAt:expiry,metrics:{date,ma20,ma60,return20Pct:ret,relative20Pct:rs,volatilityPct:volatility===null?null:volatility*Math.sqrt(252)*100,premiumPct:premium,amount20:amount,flowSum,flowNetPct,flowDays:flowComplete?rules.flowDays:0,adjusted,trackingErrorPct:tracking===null?null:tracking*Math.sqrt(252)*100,disclosedWeightPct:weight} }
  })
  const optionalKeys=['spread','profit-growth','cash-quality']
  const omittedConditions=optionalKeys.flatMap(key=>{
    const samples=decisions.map(decision=>decision.conditions.find(condition=>condition.key===key)).filter(Boolean) as Condition[]
    return samples.length===decisions.length&&samples.every(condition=>condition.status==='unknown')?[{key,label:samples[0].label,reason:'本轮全部标的均无可核验底层数据，已从规则复核中移除；不填零、不视为满足。'}]:[]
  })
  if(omittedConditions.length){
    const omitted=new Set(omittedConditions.map(item=>item.key))
    decisions=decisions.map(decision=>{
      const conditions=decision.conditions.filter(condition=>!omitted.has(condition.key))
      const gaps=conditions.filter(condition=>condition.status!=='met').map(condition=>`${condition.label}：${condition.status==='unknown'?'证据缺失或口径未核验':'未满足条件'}`)
      const state=decision.state==='blocked'?'blocked':decision.state==='risk-off'?'risk-off':conditions.every(condition=>condition.status==='met')?'eligible':'watch'
      const ruleAction={unheld:state==='eligible'?'建仓' as const:'观望' as const,held:state==='eligible'?'持有' as const:state==='risk-off'?'减仓' as const:'观望' as const}
      return {...decision,conditions,gaps,state,unheldAction:'观望' as const,heldAction:'观望' as const,ruleAction,evidenceIds:[...new Set(conditions.flatMap(condition=>condition.evidenceIds))]}
    })
  }
  const indexGroups=new Map<string,Bar[]>()
  for(const etf of snapshot.etfs.filter(e=>e.indexCode)){
    const candidate=validBars(etf.indexBars,cutoff),current=indexGroups.get(etf.indexCode!)
    if(!current || (candidate.at(-1)?.date===cutoff&&current.at(-1)?.date!==cutoff) || (candidate.at(-1)?.date===current.at(-1)?.date&&candidate.length>current.length))indexGroups.set(etf.indexCode!,candidate)
  }
  const usableIndices=[...indexGroups.values()].filter(b=>b.length>=rules.minHistory&&b.at(-1)?.date===cutoff)
  const financialCompanyCount=snapshot.companies.filter(c=>c.financialPeriods>=2).length
  const companyCoverage=snapshot.companies.length?financialCompanyCount/snapshot.companies.length:0
  const profitCount=snapshot.companies.filter(c=>finite(c.profitGrowthPct)).length,cashCount=snapshot.companies.filter(c=>finite(c.cashConversionPct)).length
  const companyDecisionCoverage=snapshot.companies.length?Math.min(profitCount,cashCount)/snapshot.companies.length:0
  const companyModule=companyCoverage>=0.8&&companyDecisionCoverage>=0.6
    ? {status:'available' as const,detail:`${financialCompanyCount}/${snapshot.companies.length} 家具备多期财报，${profitCount} 家利润同比、${cashCount} 家现金质量可计算`}
    : financialCompanyCount
      ? {status:'limited' as const,detail:`${financialCompanyCount}/${snapshot.companies.length} 家具备多期财报，但仅 ${profitCount} 家利润同比、${cashCount} 家现金质量可计算`}
      : {status:'missing' as const,detail:'持仓暴露池和产业领先池均缺少多期财报'}
  const changes=previous?decisions.flatMap(d=>{
    const old=previous.decisions.find(o=>o.ticker===d.ticker)
    const changedConditions=d.conditions.filter(c=>{const before=old?.conditions.find(o=>o.key===c.key);return !before||before.status!==c.status}).map(c=>c.key)
    return !old||old.state!==d.state||changedConditions.length?[{ticker:d.ticker,from:old?.state||'new',to:d.state,reason:d.reason,changedConditions}]:[]
  }):[]
  return {version:1,snapshotId:snapshot.id,asOf:snapshot.asOf,workflow:snapshot.workflow,profile,expectedSession:cutoff,calendarVerified:boundary.verified,validation:'experimental-not-backtest-validated',decisions,
    products:snapshot.etfs.map(e=>({ticker:e.ticker,indexCode:e.indexCode,feePct:e.product.feePct,navDate:e.product.date,shareChangePct:e.product.shares!==null&&e.product.previousShares!==null&&e.product.previousShares>0?(e.product.shares/e.product.previousShares-1)*100:null,trackingErrorPct:decisions.find(d=>d.ticker===e.ticker)?.metrics.trackingErrorPct??null,pe:e.product.pe,pb:e.product.pb,valuationDate:e.product.valuationDate||null,valuationSource:e.product.valuationSource||null,pePercentile5y:e.product.pePercentile5y,pbPercentile5y:e.product.pbPercentile5y,valuationSampleCount:e.product.valuationSampleCount,alternatives:e.indexCode?snapshot.etfs.filter(other=>other.ticker!==e.ticker&&other.indexCode===e.indexCode).map(other=>other.ticker):[],exposure:profile.segments.map(s=>({segment:s.name,weightPct:decisions.find(d=>d.ticker===e.ticker)?.metrics.disclosedWeightPct==null?null:e.holdings.filter(h=>s.companies.includes(h.code)).reduce((n,h)=>n+(h.weight||0),0)}))})),
    indexBreadth:{mappedIndices:indexGroups.size,usableIndices:usableIndices.length,aboveMA20:usableIndices.filter(b=>b.at(-1)!.close>mean(b.slice(-20).map(r=>r.close))!).length,coverage:indexGroups.size?usableIndices.length/indexGroups.size:0},
    modules:{market:{status:benchmark.length>=rules.minHistory&&benchmark.at(-1)?.date===cutoff?'available':'missing',detail:'统一收盘日与基准序列'},flow:{status:flowComplete?'available':'missing',detail:flowComplete?`${rules.flowDays}个交易日完整领域板块覆盖`:'需要配置领域板块并补齐多日记录'},company:companyModule,events:{status:snapshot.events.some(e=>e.status==='evidence')?'available':'missing',detail:'同标题/公司/日期归并，异标题事件仍需人工核验，转载不算独立证据'}},events:snapshot.events,changes,previousSnapshotId:previous?.snapshotId||null,evidence:snapshot.evidence,omittedConditions}
}
