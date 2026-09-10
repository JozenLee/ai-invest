import { administrativeTitle, digestTitle, nonMaterialRiskTitle } from '@/lib/research/event-policy'
import type { Decision, Evaluation } from '@/lib/research/contracts'
import type { DecisionTimingAssessment } from './decision-timing'

export type ReportQuality = { status?: string } | null | undefined

const signalConditionKeys=new Set(['market','trend','relative','flow'])
const dataConditionKeys=['calendar','session','history','continuity','adjustment','index','premium','liquidity','spread','volatility','holdings','fundamentals','profit-growth','cash-quality','events']

export function reportCoverage(evaluation?:Evaluation){
  const decisions=evaluation?.decisions||[],total=decisions.length
  const omitted=new Set(evaluation?.omittedConditions?.map(item=>item.key)||[])
  const conditionCount=(key:string,status?:'met'|'unmet'|'unknown')=>decisions.filter(decision=>{
    const condition=decision.conditions.find(item=>item.key===key)
    if(!condition)return status==='unknown'&&omitted.has(key)
    return status?condition.status===status:condition.status!=='unknown'
  }).length
  const activeDataKeys=dataConditionKeys.filter(key=>!omitted.has(key))
  const dataConditions=decisions.flatMap(decision=>decision.conditions.filter(condition=>activeDataKeys.includes(condition.key)))
  const dataUnknown=dataConditions.filter(condition=>condition.status==='unknown').length
  // Market direction belongs to the tracked index, not to the wrapper product.
  // Counting every ETF duplicated the same signal for funds sharing one index.
  const indexGroups=new Map<string,Decision[]>()
  for(const decision of decisions){const key=decision.indexCode||`product:${decision.ticker}`;indexGroups.set(key,[...(indexGroups.get(key)||[]),decision])}
  const signalStatus=(rows:Decision[],key:string)=>{
    const statuses=rows.map(row=>row.conditions.find(condition=>condition.key===key)?.status||'unknown')
    const known=statuses.filter(status=>status!=='unknown')
    if(!known.length)return 'unknown'
    return known.every(status=>status==='met')?'met':'unmet'
  }
  const indexSignals=[...indexGroups.values()].flatMap(rows=>[...signalConditionKeys].map(key=>signalStatus(rows,key)))
  const signalTotal=indexSignals.length
  const signalMet=indexSignals.filter(status=>status==='met').length
  const signalUnmet=indexSignals.filter(status=>status==='unmet').length
  const signalUnknown=indexSignals.filter(status=>status==='unknown').length
  const groups=new Map<string,NonNullable<Evaluation['products']>>()
  for(const product of evaluation?.products||[]){if(product.indexCode)groups.set(product.indexCode,[...(groups.get(product.indexCode)||[]),product])}
  const currentValuation=[...groups.values()].filter(rows=>rows.some(row=>row.valuationDate===evaluation?.expectedSession&&(finite(row.pe)&&row.pe!>0||finite(row.pb)&&row.pb!>0))).length
  const field=(key:string,label:string)=>({key,label,known:conditionCount(key),total,detail:`${conditionCount(key)}/${total} 项具备可核验底层数据`})
  return {
    dataUnknown,dataTotal:dataConditions.length,signalMet,signalUnmet,signalUnknown,signalTotal,signalKnown:signalTotal-signalUnknown,indexCount:indexGroups.size,
    data:[
      field('premium','同日折溢价'),
      field('spread','交易时段买卖价差'),
      field('holdings','最新定期持仓权重'),
      field('profit-growth','持仓加权利润同比'),
      field('cash-quality','持仓加权现金质量'),
      {key:'valuation-current',label:'指数同日估值',known:currentValuation,total:groups.size||evaluation?.indexBreadth.mappedIndices||0,detail:`${currentValuation}/${groups.size||evaluation?.indexBreadth.mappedIndices||0} 个跟踪指数估值日期与研究基准日一致`},
    ].filter(item=>item.total>0&&!omitted.has(item.key)),
    signals:[
      ...[...signalConditionKeys].map(key=>({key,label:{market:'基准趋势',trend:'指数趋势确认',relative:'相对基准转强',flow:'领域资金改善'}[key]||key,met:[...indexGroups.values()].filter(rows=>signalStatus(rows,key)==='met').length,unmet:[...indexGroups.values()].filter(rows=>signalStatus(rows,key)==='unmet').length,unknown:[...indexGroups.values()].filter(rows=>signalStatus(rows,key)==='unknown').length,total:indexGroups.size})),
    ],
  }
}

export function decisionConfidence(decision: Decision) {
  const criticalKeys = new Set(['calendar','session','history','continuity','adjustment','index'])
  const signalKeys = new Set(['market','trend','relative','flow'])
  const fundamentalKeys = new Set(['holdings','fundamentals','profit-growth','cash-quality','events'])
  const coverage = (keys:Set<string>) => {
    const rows=decision.conditions.filter(item=>keys.has(item.key))
    return rows.length ? rows.filter(item=>item.status!=='unknown').length/rows.length : 0
  }
  const productKeys=new Set(['premium','liquidity','spread','volatility'])
  const score=Math.round(coverage(criticalKeys)*30+coverage(signalKeys)*20+coverage(fundamentalKeys)*25+coverage(productKeys)*15+Math.min(1,decision.evidenceIds.length/12)*10)
  return Math.min(decision.state==='blocked'?35:decision.state==='watch'?75:90,Math.max(15,score))
}

export function reportAdviceConfidence(evaluation?:Evaluation,quality?:ReportQuality){
  if(!evaluation?.decisions.length)return 0
  const base=evaluation.decisions.reduce((sum,item)=>sum+decisionConfidence(item),0)/evaluation.decisions.length
  const qualityFactor=quality?.status==='blocked' ? .45 : quality?.status==='limited' ? .8 : 1
  return Math.round(base*qualityFactor)
}

export function reportReadiness(evaluation?: Evaluation, quality?: ReportQuality, timing?: DecisionTimingAssessment) {
  const reasons: string[] = []
  if (!evaluation) reasons.push('缺少冻结规则评估')
  if (quality?.status === 'blocked') reasons.push('核心行情数据不足，只能给出低置信度观望建议')
  else if (quality?.status === 'limited') reasons.push('部分产品或基本面数据缺失，已降低建议置信度')
  if (timing && !timing.executionReady) reasons.push(...timing.reasons)
  const approved = !!evaluation && quality?.status !== 'blocked'
  const executionReady = approved && timing?.executionReady !== false
  return {
    level: executionReady ? 'advice-ready' as const : approved ? 'reference-only' as const : 'data-limited' as const,
    label: executionReady ? '交易时段投资建议' : approved ? '投资参考已生成' : '低置信度参考',
    confidencePct: reportAdviceConfidence(evaluation,quality),
    reasons,
  }
}

export function safeDecisionAction(decision: Decision, _tradeReady = true) {
  const confidencePct=decisionConfidence(decision)
  if (decision.state === 'blocked') return { unheld: '观望', held: '持有并复核数据', intent: decision.reason||'核心数据不足，暂不改变仓位。', confidencePct }
  if (!_tradeReady) {
    if (decision.state === 'risk-off') return { unheld: '暂缓新增', held: '复核风险敞口', intent: `时效未通过，以下仅作参考：${decision.reason}`, confidencePct }
    if (decision.state === 'eligible') return { unheld: '待盘中复核', held: '持有并等待复核', intent: `条件方向仅作参考：${decision.reason}`, confidencePct }
    return { unheld: '观望', held: '持有并等待复核', intent: decision.reason||'关键条件尚未形成一致方向。', confidencePct }
  }
  if (decision.state === 'risk-off') return { unheld: '观望', held: '减仓', intent: decision.reason, confidencePct }
  if (decision.state === 'eligible') return { unheld: '建仓', held: '持有', intent: decision.reason, confidencePct }
  return { unheld: '观望', held: '持有', intent: decision.reason||'关键条件尚未形成一致方向。', confidencePct }
}

export function guardActionLanguage(value: unknown, tradeReady = false): unknown {
  if(tradeReady)return value
  if(typeof value==='string'){
    const clean=value.trim().replace(/^```(?:json)?\s*/,'').replace(/\s*```$/,'')
    if(clean.startsWith('{')||clean.startsWith('[')){
      try{return guardActionLanguage(JSON.parse(clean),tradeReady)}catch{/* Preserve malformed archived text for inspection. */}
    }
    return value
      .replace(/未持有观望、已持有减仓/g,'未持有暂缓新增、已持有复核风险敞口')
      .replace(/未持有：观望；已持有：减仓/g,'未持有：暂缓新增；已持有：复核风险敞口')
      .replace(/程序动作为未持有观望、已持有减仓/g,'程序状态提示未持有暂缓新增、已持有复核风险敞口')
  }
  if(Array.isArray(value))return value.map(item=>guardActionLanguage(item,tradeReady))
  if(value&&typeof value==='object')return Object.fromEntries(Object.entries(value).map(([key,item])=>{
    if(key==='unheld'&&typeof item==='string'&&/建仓|买入|加仓/.test(item))return [key,'待交易时段复核']
    if(key==='held'&&typeof item==='string'&&/减仓|卖出|加仓/.test(item))return [key,'复核风险敞口']
    if(key==='action'&&typeof item==='string'&&/建仓|买入|卖出|加仓|减仓/.test(item))return [key,'待交易时段复核']
    return [key,guardActionLanguage(item,tradeReady)]
  }))
  return value
}

const finite = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value)

export function productGroups(evaluation?: Evaluation) {
  if (!evaluation?.products?.length) return []
  const decisions = new Map(evaluation.decisions.map(item => [item.ticker, item]))
  const groups = new Map<string, NonNullable<Evaluation['products']>>()
  for (const product of evaluation.products) {
    const key = product.indexCode || `unmapped:${product.ticker}`
    groups.set(key, [...(groups.get(key) || []), product])
  }
  return [...groups].map(([indexCode, products]) => {
    const comparisonDate=products.map(product=>product.navDate).filter((value):value is string=>!!value).sort().at(-1)||null
    const ranked = products.map(product => {
      const decision = decisions.get(product.ticker)
      const navFresh = product.navDate === evaluation.expectedSession
      const trackingValid = finite(product.trackingErrorPct) && product.trackingErrorPct >= 0 && product.trackingErrorPct <= 20
      const trackingAnomaly = finite(product.trackingErrorPct) && product.trackingErrorPct > 20
      const premiumKnown = finite(decision?.metrics.premiumPct)
      const score = (navFresh ? 4 : 0) + (trackingValid ? Math.max(0, 3 - product.trackingErrorPct! / 10) : 0)
        + (finite(product.feePct) ? Math.max(0, 1 - product.feePct) : 0) + (premiumKnown ? 1 : 0)
        + (finite(decision?.metrics.amount20) && decision!.metrics.amount20! >= evaluation.profile.rules.minDailyAmount ? 1 : 0)
      const exclusions=[product.navStatus==='stale'||product.navDate&&evaluation.expectedSession&&Date.parse(evaluation.expectedSession)-Date.parse(product.navDate)>7*86400000?'净值过旧，不参与当期研究比较':null,!product.navDate?'净值缺失':product.navDate!==comparisonDate?'净值日期与本组比较时点不一致':null,!trackingValid?'跟踪误差不可用或异常':null,!finite(product.feePct)?'管理费缺失':null,!finite(decision?.metrics.amount20)?'流动性缺失':decision!.metrics.amount20!<evaluation.profile.rules.minDailyAmount?'流动性低于门槛':null].filter((item):item is string=>!!item)
      return { ...product, decision, navFresh, trackingValid, trackingAnomaly, score, exclusions }
    }).sort((a, b) => b.score - a.score || a.ticker.localeCompare(b.ticker))
    const eligible=ranked.filter(item=>!item.exclusions.length)
    const best = eligible[0]
    const comparable = products.length > 1 && !!best && !!comparisonDate
    return {
      indexCode,
      products: ranked,
      comparisonCandidate: comparable ? best.ticker : null,
      comparisonDate,
      status: products.length===1?'single-product':comparable?'comparable':'insufficient',
      executionReady:!!best&&best.navFresh&&finite(best.decision?.metrics.premiumPct)&&best.decision?.state==='eligible',
      reason:products.length===1?'本指数仅有一只已订阅产品，无同指数对照':comparable?`按${comparisonDate}净值覆盖、管理费、跟踪误差与流动性筛选；仅供产品研究，建仓仍需本轮信号与交易门禁`:'没有同时具备可比净值、管理费、有效跟踪误差及流动性的产品',
      valuation: {
        pe: ranked.find(item => finite(item.pe) && item.pe! > 0)?.pe ?? null,
        pb: ranked.find(item => finite(item.pb) && item.pb! > 0)?.pb ?? null,
        pePercentileHistory: ranked.find(item=>finite(item.pePercentileHistory))?.pePercentileHistory??null,
        pbPercentileHistory: ranked.find(item=>finite(item.pbPercentileHistory))?.pbPercentileHistory??null,
        historyStart: ranked.find(item=>item.valuationHistoryStart)?.valuationHistoryStart??null,
        sampleCount: ranked.find(item=>item.valuationSampleCount)?.valuationSampleCount??0,
        date: ranked.find(item => item.valuationDate)?.valuationDate ?? null,
        source: ranked.find(item => item.valuationSource)?.valuationSource ?? null,
      },
    }
  }).sort((a, b) => a.indexCode.localeCompare(b.indexCode))
}

export function representativeProducts(evaluation?:Evaluation,limit=3){
  if(!evaluation)return []
  const products=new Map((evaluation.products||[]).map(product=>[product.ticker,product]))
  const family=(name:string)=>/云计算/.test(name)?'云计算':/通信|5G/.test(name)?'通信':/芯片|半导体|集成电路/.test(name)?'芯片':'其他'
  const groups=new Map<string,Decision[]>()
  for(const decision of evaluation.decisions)groups.set(family(decision.name),[...(groups.get(family(decision.name))||[]),decision])
  return [...groups.values()].map(rows=>rows.sort((a,b)=>{
    const ap=products.get(a.ticker),bp=products.get(b.ticker)
    const anomaly=(p:typeof ap)=>typeof p?.trackingErrorPct==='number'&&p.trackingErrorPct>20
    if(anomaly(ap)!==anomaly(bp))return anomaly(ap)?1:-1
    return (b.metrics.relative20Pct??-Infinity)-(a.metrics.relative20Pct??-Infinity)||(b.metrics.amount20??0)-(a.metrics.amount20??0)
  })[0]).filter(Boolean).slice(0,limit)
}

function eventFingerprint(title: string) {
  return title.toLowerCase().replace(/^[^:：]{1,20}[:：]/, '').replace(/【[^】]*】/g, '').replace(/[\s\p{P}]/gu, '')
}

export function decisionEvents(evaluation?: Evaluation, limit = 12) {
  if (!evaluation) return []
  const seen = new Set<string>()
  const candidates=[...(evaluation.events||[])]
    .filter(item => item.status === 'evidence' && item.category !== 'administrative' && !administrativeTitle.test(item.title) && !digestTitle.test(item.title) && !nonMaterialRiskTitle.test(item.title) && item.priority >= 4 && !['C','D'].includes(item.evidenceGrade||'B') && (item.materialityScore??70)>=65)
    .sort((a, b) => (b.materialityScore??0)-(a.materialityScore??0) || b.priority - a.priority || b.publishedAt.localeCompare(a.publishedAt))
    .filter(item => {
      const key = [eventFingerprint(item.title),item.publishedAt.slice(0,10),[...item.companies].sort().join(',')].join(':')
      if (!key || seen.has(key)) return false
      seen.add(key)
      return true
    })

  if(candidates.length<=limit)return candidates
  const selected=new Map<string,typeof candidates[number]>(),buckets=new Set<string>()
  // Reserve representation for event type / industry segment before filling the
  // remaining budget by priority and recency. The UI can still show the full pool.
  for(const row of candidates){const bucket=row.category+':'+(row.segments[0]||'company');if(!buckets.has(bucket)&&selected.size<Math.min(8,limit)){buckets.add(bucket);selected.set(row.id,row)}}
  for(const row of candidates){if(selected.size>=limit)break;selected.set(row.id,row)}
  return candidates.filter(row=>selected.has(row.id))
}

export function horizonViews(evaluation?: Evaluation) {
  if (!evaluation) return null
  const riskOff = evaluation.decisions.filter(item => item.state === 'risk-off').length
  const eligible = evaluation.decisions.filter(item => item.state === 'eligible').length
  const valuationCount = productGroups(evaluation).filter(group => group.valuation.pe !== null || group.valuation.pb !== null).length
  return {
    tactical: `${evaluation.profile.horizonDays}个交易日：${riskOff?`${riskOff}只风险收缩`:'暂无产品触发风险收缩'}，${eligible?`${eligible}只满足实验条件`:'暂无产品满足实验条件'}；${evaluation.indexBreadth.aboveMA20?`${evaluation.indexBreadth.aboveMA20}/${evaluation.indexBreadth.usableIndices}个有效指数位于20日均线上方`:'有效指数均未站上20日均线'}。`,
    strategic: `6—12个月：企业财务模块${evaluation.modules.company?.status === 'available' ? '可用' : '仍有限'}，${valuationCount?`${valuationCount}/${evaluation.indexBreadth.mappedIndices}个指数具备可展示估值`:'暂无指数具备可展示估值'}；产业逻辑需由订单、盈利和现金流持续验证。`,
  }
}

export function deterministicScenarios(evaluation?:Evaluation){
  if(!evaluation)return null
  const uniqueProducts=[...new Map((evaluation.products||[]).map(item=>[item.indexCode||item.ticker,item])).values()]
  const percentiles=uniqueProducts.map(item=>item.pePercentileHistory).filter(finite).sort((a,b)=>a-b)
  const medianPercentile=percentiles.length?percentiles[Math.floor(percentiles.length/2)]:null
  const factorScores=evaluation.decisions.map(item=>item.metrics.factorScore).filter(finite)
  const factorScore=factorScores.length?Math.round(factorScores.reduce((sum,value)=>sum+value,0)/factorScores.length):null
  const profit=evaluation.decisions.map(item=>item.conditions.find(condition=>condition.key==='profit-growth')).filter(Boolean)
  const cash=evaluation.decisions.map(item=>item.conditions.find(condition=>condition.key==='cash-quality')).filter(Boolean)
  return {
    inputs:{valuationMedianPercentile:medianPercentile,multiFactorAverageScore:factorScore,profitGrowthPositive:profit.filter(item=>item?.status==='met').length,profitGrowthKnown:profit.filter(item=>item?.status!=='unknown').length,cashQualityHealthy:cash.filter(item=>item?.status==='met').length,cashQualityKnown:cash.filter(item=>item?.status!=='unknown').length},
    base:{conditions:'盈利与现金流按当前已披露广度延续，估值分位与多周期趋势不显著改善。',expectedReturn:null},
    bull:{conditions:'盈利扩散、现金转化改善且风险调整动量转强；估值扩张必须由盈利兑现支持。',expectedReturn:null},
    bear:{conditions:'盈利或订单下修、现金流恶化，并伴随估值分位回落和下行波动扩大。',expectedReturn:null},
    decomposition:'未来收益应分解为盈利增长、估值变化、分红、管理费及跟踪偏差；缺少一致预测时不输出伪精确收益率。',
  }
}

export function evidenceHealth(evaluation?: Evaluation) {
  const rows = evaluation?.evidence || []
  return {
    total: rows.length,
    missingDataDate: rows.filter(item => !item.dataDate).length,
    missingPublishedAt: rows.filter(item => !item.publishedAt).length,
    decisionEvents: decisionEvents(evaluation, Number.MAX_SAFE_INTEGER).length,
  }
}

/** Count one signal per index; product proliferation must not change direction. */
export function indexRuleSummary(evaluation?: Evaluation) {
  const grouped=new Map<string,Decision[]>()
  for(const row of evaluation?.decisions||[]) {const key=row.indexCode||row.ticker;grouped.set(key,[...(grouped.get(key)||[]),row])}
  const states=[...grouped.values()].map(rows=>rows.every(row=>row.state==='blocked')?'blocked':rows.filter(row=>row.state!=='blocked').every(row=>row.state==='risk-off')?'risk-off':rows.some(row=>row.state==='eligible')?'eligible':'watch')
  const riskOff=states.filter(state=>state==='risk-off').length,eligible=states.filter(state=>state==='eligible').length
  return {total:states.length,riskOff,eligible,blocked:states.filter(state=>state==='blocked').length,watch:states.filter(state=>state==='watch').length,signal:!states.length||states.every(state=>state==='blocked')?'blocked' as const:riskOff>=Math.ceil(states.length/2)?'risk-off' as const:eligible?'eligible' as const:'watch' as const,
    reason:`${states.length}个唯一指数：${riskOff}个风险收缩，${eligible}个满足条件，${states.filter(state=>state==='blocked').length}个不可判；同指数产品不重复投票。`}
}

export function consolidateWatchlist(items:string[]){
  const normalized=(value:string)=>value.replace(/[\s、，。！？；：“”和与及]/g,'').toLowerCase()
  const grams=(value:string)=>new Set(Array.from({length:Math.max(0,value.length-1)},(_,index)=>value.slice(index,index+2)))
  const result:string[]=[]
  for(const item of items){
    const key=normalized(item),current=grams(key)
    const index=result.findIndex(other=>{
      const old=normalized(other),prior=grams(old)
      const numbers=(value:string)=>(value.match(/\d+(?:\.\d+)?/g)||[]).join(',')
      if(numbers(key)!==numbers(old))return false
      const overlap=[...current].filter(gram=>prior.has(gram)).length
      return key===old||current.size>=4&&prior.size>=4&&overlap/Math.min(current.size,prior.size)>=.75
    })
    if(index<0)result.push(item)
    else if(item.length>result[index].length)result[index]=item
  }
  return result
}
