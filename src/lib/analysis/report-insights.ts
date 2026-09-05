import type { Decision, Evaluation } from '@/lib/research/contracts'
import { matchesResearchDomain, researchTerms } from '@/lib/research/relevance'

export type ReportQuality = { status?: string } | null | undefined

export function reportReadiness(evaluation?: Evaluation, quality?: ReportQuality, performanceApproved = false) {
  const reasons: string[] = []
  if (!evaluation) reasons.push('缺少冻结规则评估')
  if (!performanceApproved) reasons.push('尚未完成两年以上样本外滚动验证')
  if (quality?.status !== 'available') reasons.push('仍有产品或基本面数据缺口')
  const approved = !!evaluation && performanceApproved && quality?.status === 'available'
  return {
    level: approved ? 'trade-ready' as const : 'watch-only' as const,
    label: approved ? '交易条件已验证' : '观察级报告',
    reasons,
  }
}

export function safeDecisionAction(decision: Decision, tradeReady = false) {
  if (decision.state === 'blocked') return { unheld: '数据受限', held: '保持原计划并复核数据', intent: '不形成动作' }
  if (!tradeReady) {
    if (decision.state === 'risk-off') return { unheld: '暂缓新增', held: '复核风险敞口', intent: '实验规则触发风险收缩，但不直接给出减仓比例' }
    if (decision.state === 'eligible') return { unheld: '观察候选', held: '复核持有条件', intent: '条件满足但尚未经样本外验证' }
    return { unheld: '继续观察', held: '复核持有条件', intent: '关键条件尚未全部满足' }
  }
  return { unheld: decision.unheldAction, held: decision.heldAction, intent: decision.reason }
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
