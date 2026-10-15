import { auditFinancialFacts, type FinancialFact } from './financial-facts'
import type { Evaluation } from '@/lib/research/contracts'

/** Validate the financial unit most prone to a 100x prose conversion error.
 * Never silently rewrite a model's conclusion after changing its factual basis. */
export function validateDecisionFacts(value: unknown, evaluation?: Evaluation) {
  if (!evaluation?.decisions) return
  if(value&&typeof value==='object'&&!Array.isArray(value)){
    const root=value as Record<string,unknown>
    const products=Array.isArray(root.productDecisions)?root.productDecisions as Array<Record<string,unknown>>:[]
    const summary=root.executiveSummary as Record<string,unknown>|undefined
    const noIncrease=products.length>0&&products.every(item=>item.unheldAction!=='建仓'&&item.heldAction!=='加仓')
    for(const sentence of String(summary?.conclusion||'').split(/[。；;]/u)){
      const positive=/(?<!不)可配置|适合建仓|建议买入|建议加仓|可以建仓/u.test(sentence)
      const conditional=/候选|(?:待|若|如果|仅在|满足).{0,80}(?:后|时|则)/u.test(sentence)
      const blockedMention=products.some(item=>sentence.includes(String(item.ticker))&&evaluation.decisions.some(decision=>decision.ticker===item.ticker&&decision.state==='blocked'))
      if(positive&&!conditional&&(noIncrease||blockedMention))throw new Error('投资结论一致性校验失败：摘要把流动性候选写成当前可配置，但逐产品动作未允许增加暴露或数据门禁仍受限；请明确候选资格与当前操作，保留真实模型观点')
    }
  }
  const spreads = evaluation.decisions.flatMap(decision => decision.conditions
    .filter(condition => condition.key === 'spread')
    .flatMap(condition => [condition.value, condition.threshold])
    .filter((number): number is number => typeof number === 'number' && Number.isFinite(number)))
  const visit = (item: unknown): void => {
    if (typeof item === 'string') {
      const liquidityClaim=item.match(/流动性(?:合格|达标)(?:的)?产品(?:仅|只有)([^。；]+)/u)
      if(liquidityClaim){
        const passed=evaluation.decisions.filter(decision=>decision.conditions.some(condition=>condition.key==='liquidity'&&condition.status==='met')).map(decision=>decision.ticker)
        const tickers=[...new Set(liquidityClaim[1].match(/\b\d{6}\b/g)||[])]
        const countText=liquidityClaim[1].match(/([一二三四五六七八九十]|\d+)只/u)?.[1]
        const count=countText?(/[0-9]/.test(countText)?Number(countText):'一二三四五六七八九十'.indexOf(countText)+1):tickers.length
        if(count!==passed.length||tickers.some(ticker=>!passed.includes(ticker)))throw new Error(`数值事实校验失败：成交额门槛实际有${passed.length}只达标（${passed.join('、')}），不得把头部排名或价差限制说成流动性达标数量；请使用productConditionCounts分别表述`)
      }
      const hasFactors=evaluation.decisions.filter(decision=>(decision.adjustmentAudit?.matchedFactorDates||0)>0)
      const positiveText=item.replace(/(?:并非|不是|不等于|不得(?:说成|表述为)?|不能(?:说成|表述为)?|而非)[^。；]{0,8}(?:全部缺失|完全缺失)/gu,'')
      if(/复权因子.{0,12}(?:全部缺失|全缺|完全缺失)|(?:全部|完全)缺失.{0,8}复权因子/u.test(positiveText) && hasFactors.length &&
        (hasFactors.some(decision=>item.includes(decision.ticker)) || /(?:只ETF|只基金|全部ETF|所有ETF|全体|全部缺失)/u.test(item))) {
        throw new Error('数值事实校验失败：已有复权因子，不能写成全部缺失；必须按adjustmentCoverage说明已匹配日期数、部分缺口或复权后跳变')
      }
      for (const match of item.matchAll(/(?:买卖)?价差[^。；;\n]{0,60}/gu)) {
        for (const amount of match[0].matchAll(/(\d+(?:\.\d+)?)\s*[%％]/gu)) {
          const value = Number(amount[1])
          if (value > 0 && spreads.some(bps => Math.abs(bps - value) <= .011 && Math.abs(bps / 100 - value) > .011)) {
            throw new Error(`数值事实校验失败：价差${value}%疑似把基点写成百分比；100基点=1%，请核对冻结spread条件的单位并重新推理`)
          }
        }
      }
    } else if (Array.isArray(item)) item.forEach(visit)
    else if (item && typeof item === 'object') Object.values(item).forEach(visit)
  }
  visit(value)
}

export function auditDecisionEvidence(value: unknown, evaluation?: Evaluation) {
  const record = value && typeof value === 'object' ? value as Record<string, unknown> : {}
  const allowed = new Set(evaluation?.evidence.map(item => item.id) || [])
  return (Array.isArray(record.productDecisions) ? record.productDecisions : []).flatMap((item: Record<string, unknown>) => {
    const ids = Array.isArray(item.evidenceIds) ? item.evidenceIds.map(String) : []
    const invalid = ids.filter(id => !allowed.has(id))
    const product=evaluation?.decisions.find(decision=>decision.ticker===String(item.ticker))
    const linked=!!product&&ids.some(id=>product.evidenceIds.includes(id))
    return !ids.length || invalid.length || !linked ? [{ ticker: String(item.ticker), reason: !ids.length ? '产品观点未绑定冻结证据' : invalid.length ? '产品观点引用了本轮不存在的证据' : '产品观点未绑定该产品的证据', invalidIds: invalid }] : []
  })
}

export function reportIntegrityWarnings(data: Record<string,unknown>) {
  const evaluation=data.researchEvaluation as Evaluation|undefined
  const warnings:string[]=[]
  const facts=(Array.isArray(data.canonicalFinancialFacts)?data.canonicalFinancialFacts:[]) as FinancialFact[]
  for(const key of ['marketAnalysis','sentimentAnalysis','companyAnalysis','industryAnalysis','investmentAdvice']){
    let value=data[key]
    if(typeof value==='string'){try{value=JSON.parse(value)}catch{/* plain archived prose remains auditable */}}
    warnings.push(...auditFinancialFacts(value,facts))
    try{validateDecisionFacts(value,evaluation)}catch(error){warnings.push(error instanceof Error&&error.message.includes('成交额门槛')?'报告混淆了成交额达标数量与候选产品排名，需重新核验':error instanceof Error&&error.message.includes('价差')?'报告中的买卖价差存在基点与百分比单位混用，需重新生成核验':error instanceof Error&&error.message.includes('复权')?'报告将部分复权数据缺口误述为全部缺失，需重新生成核验':error instanceof Error&&error.message.includes('一致性')?'报告摘要的配置表述与逐产品动作不一致，需重新核验':'报告数值校验未通过')}
  }
  return [...new Set(warnings)]
}

export function validateProductEvidence(value:unknown,evaluation?:Evaluation){
  if(!evaluation?.evidence?.length)return
  const issues=auditDecisionEvidence(value,evaluation)
  if(issues.length)throw new Error(`产品证据校验失败：${issues.map(item=>`${item.ticker} ${item.reason}`).join('；')}。请从各产品evidenceIds逐字复制编号，数据不足的观望结论也必须引用其数据边界证据`)
}
