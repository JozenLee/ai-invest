import type { Decision, Evaluation } from '@/lib/research/contracts'
import { matchesResearchDomain, researchTerms } from '@/lib/research/relevance'
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
  const dataUnknown=dataConditionKeys.reduce((sum,key)=>sum+conditionCount(key,'unknown'),0)
  const signalTotal=total*signalConditionKeys.size
  const signalUnmet=[...signalConditionKeys].reduce((sum,key)=>sum+conditionCount(key,'unmet'),0)
  const signalUnknown=[...signalConditionKeys].reduce((sum,key)=>sum+conditionCount(key,'unknown'),0)
  const groups=new Map<string,NonNullable<Evaluation['products']>>()
  for(const product of evaluation?.products||[]){if(product.indexCode)groups.set(product.indexCode,[...(groups.get(product.indexCode)||[]),product])}
  const currentValuation=[...groups.values()].filter(rows=>rows.some(row=>finite(row.pe)&&row.pe!>0||finite(row.pb)&&row.pb!>0)).length
  const historicalValuation=[...groups.values()].filter(rows=>rows.some(row=>(row.valuationSampleCount||0)>=500&&(finite(row.pePercentile5y)||finite(row.pbPercentile5y)))).length
  return {
    dataUnknown,dataTotal:total*dataConditionKeys.length,signalUnmet,signalUnknown,signalTotal,
    data:[
      {key:'premium',label:'同日折溢价',known:conditionCount('premium'),total},
      {key:'spread',label:'同日买卖价差',known:conditionCount('spread'),total},
      {key:'holdings',label:'最新持仓权重',known:conditionCount('holdings'),total},
      {key:'profit-growth',label:'持仓加权利润',known:conditionCount('profit-growth'),total},
      {key:'cash-quality',label:'持仓加权现金质量',known:conditionCount('cash-quality'),total},
      {key:'valuation-history',label:'指数历史估值分位',known:historicalValuation,total:groups.size||evaluation?.indexBreadth.mappedIndices||0,detail:`${currentValuation}个指数仅有当期估值`},
    ],
    signals:[
      {key:'market',label:'基准趋势',met:conditionCount('market','met'),total},
      {key:'trend',label:'指数趋势确认',met:conditionCount('trend','met'),total},
      {key:'relative',label:'相对基准转强',met:conditionCount('relative','met'),total},
      {key:'flow',label:'领域资金改善',met:conditionCount('flow','met'),total},
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
  const score=Math.round(coverage(criticalKeys)*35+coverage(signalKeys)*25+coverage(fundamentalKeys)*20+Math.min(1,decision.evidenceIds.length/12)*20)
  return Math.min(decision.state==='blocked'?35:decision.state==='watch'?75:90,Math.max(15,score))
}

export function reportAdviceConfidence(evaluation?:Evaluation,quality?:ReportQuality){
  if(!evaluation?.decisions.length)return 0
  const base=evaluation.decisions.reduce((sum,item)=>sum+decisionConfidence(item),0)/evaluation.decisions.length
  const qualityFactor=quality?.status==='blocked' ? .45 : quality?.status==='limited' ? .8 : 1
  return Math.round(base*qualityFactor)
}

export function reportReadiness(evaluation?: Evaluation, quality?: ReportQuality, _performanceApproved = false, timing?: DecisionTimingAssessment) {
  void _performanceApproved
  const reasons: string[] = []
  if (!evaluation) reasons.push('缺少冻结规则评估')
  if (quality?.status === 'blocked') reasons.push('核心行情数据不足，只能给出低置信度观望建议')
  else if (quality?.status === 'limited') reasons.push('部分产品或基本面数据缺失，已降低建议置信度')
  if (timing && !timing.executionReady) reasons.push(...timing.reasons)
  const approved = !!evaluation && quality?.status !== 'blocked'
  const executionReady = approved && timing?.executionReady !== false
  return {
    level: executionReady ? 'advice-ready' as const : approved ? 'reference-only' as const : 'data-limited' as const,
    label: executionReady ? '盘中投资建议' : approved ? '投资参考已生成' : '低置信度参考',
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
  if(typeof value==='string')return value
    .replace(/未持有观望、已持有减仓/g,'未持有暂缓新增、已持有复核风险敞口')
    .replace(/未持有：观望；已持有：减仓/g,'未持有：暂缓新增；已持有：复核风险敞口')
    .replace(/程序动作为未持有观望、已持有减仓/g,'程序状态提示未持有暂缓新增、已持有复核风险敞口')
  if(Array.isArray(value))return value.map(item=>guardActionLanguage(item,tradeReady))
  if(value&&typeof value==='object')return Object.fromEntries(Object.entries(value).map(([key,item])=>[key,guardActionLanguage(item,tradeReady)]))
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
    const ranked = products.map(product => {
      const decision = decisions.get(product.ticker)
      const navFresh = product.navDate === evaluation.expectedSession
      const trackingValid = finite(product.trackingErrorPct) && product.trackingErrorPct >= 0 && product.trackingErrorPct <= 20
      const trackingAnomaly = finite(product.trackingErrorPct) && product.trackingErrorPct > 20
      const premiumKnown = finite(decision?.metrics.premiumPct)
      const score = (navFresh ? 4 : 0) + (trackingValid ? Math.max(0, 3 - product.trackingErrorPct! / 10) : 0)
        + (finite(product.feePct) ? Math.max(0, 1 - product.feePct) : 0) + (premiumKnown ? 1 : 0)
        + (finite(decision?.metrics.amount20) && decision!.metrics.amount20! >= evaluation.profile.rules.minDailyAmount ? 1 : 0)
      return { ...product, decision, navFresh, trackingValid, trackingAnomaly, score }
    }).sort((a, b) => b.score - a.score || a.ticker.localeCompare(b.ticker))
    const best = ranked[0]
    const comparable = ranked.length > 1 && best.navFresh && best.trackingValid && finite(best.feePct)
      && finite(best.decision?.metrics.amount20) && best.decision!.metrics.amount20! >= evaluation.profile.rules.minDailyAmount
      && finite(best.decision?.metrics.premiumPct)
    return {
      indexCode,
      products: ranked,
      comparisonCandidate: comparable ? best.ticker : null,
      valuation: {
        pe: ranked.find(item => finite(item.pe) && item.pe! > 0)?.pe ?? null,
        pb: ranked.find(item => finite(item.pb) && item.pb! > 0)?.pb ?? null,
        date: ranked.find(item => item.valuationDate)?.valuationDate ?? null,
        source: ranked.find(item => item.valuationSource)?.valuationSource ?? null,
        pePercentile5y: ranked.find(item => finite(item.pePercentile5y))?.pePercentile5y ?? null,
        pbPercentile5y: ranked.find(item => finite(item.pbPercentile5y))?.pbPercentile5y ?? null,
        sampleCount: ranked.find(item => item.valuationSampleCount)?.valuationSampleCount ?? 0,
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
  const terms=researchTerms([evaluation.profile.name,...evaluation.profile.sectors,...evaluation.profile.segments.map(item=>item.name),...evaluation.profile.leaders.map(item=>item.name)])
  return [...evaluation.events]
    .filter(item => {
      if(item.status !== 'evidence' || item.category === 'administrative' || item.priority < 4)return false
      if(item.companies.length>0)return true
      if(!matchesResearchDomain(item.title,item.excerpt,terms))return false
      const text=`${item.title} ${item.excerpt}`.toLowerCase()
      return new Set(terms.filter(term=>text.includes(term.toLowerCase()))).size>=2
    })
    .sort((a, b) => b.priority - a.priority || b.publishedAt.localeCompare(a.publishedAt))
    .filter(item => {
      const key = eventFingerprint(item.title)
      if (!key || seen.has(key)) return false
      seen.add(key)
      return true
    })
    .slice(0, limit)
}

export function horizonViews(evaluation?: Evaluation) {
  if (!evaluation) return null
  const riskOff = evaluation.decisions.filter(item => item.state === 'risk-off').length
  const eligible = evaluation.decisions.filter(item => item.state === 'eligible').length
  const valuationCount = productGroups(evaluation).filter(group => group.valuation.pe !== null || group.valuation.pb !== null).length
  return {
    tactical: `${evaluation.profile.horizonDays}个交易日：${riskOff}只风险收缩，${eligible}只满足实验条件；${evaluation.indexBreadth.aboveMA20}/${evaluation.indexBreadth.usableIndices}个有效指数位于20日均线上方。`,
    strategic: `6—12个月：企业财务模块${evaluation.modules.company?.status === 'available' ? '可用' : '仍有限'}，${valuationCount}/${evaluation.indexBreadth.mappedIndices}个指数具备可展示估值；产业逻辑需由订单、盈利和现金流持续验证。`,
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
