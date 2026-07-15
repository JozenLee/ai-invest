// 资金流向指标计算
// 主力净流入 + 北向净买入 + 融资余额 → 评分 -100 到 100

export interface CapitalFlowInput {
  /** 主力净流入（万元） */
  mainForceNet: number
  /** 北向净买入（万元） */
  northboundNet: number
  /** 融资余额变化率（%） */
  marginChangePct?: number
  /** 总成交额（万元），用于计算主力净流入占比 */
  totalVolume?: number
  /** 主力连续流入天数 */
  mainForceConsecutiveDays?: number
  /** 北向连续流入天数 */
  northboundConsecutiveDays?: number
}

export interface CapitalFlowResult {
  /** 综合资金评分 -100 ~ 100 */
  score: number
  /** 主力资金子评分 */
  mainForceScore: number
  /** 北向资金子评分 */
  northboundScore: number
  /** 融资融券子评分 */
  marginScore: number
  /** 主力资金方向 */
  mainForceDirection: 'inflow' | 'outflow' | 'neutral'
  /** 北向资金方向 */
  northboundDirection: 'inflow' | 'outflow' | 'neutral'
  /** 资金共振（主力+北向同向） */
  resonance: boolean
  /** 信号详情 */
  details: string[]
}

// 主力净流入占比阈值
const MAIN_FORCE_RATIO_THRESHOLDS = {
  strong: 0.15,    // 强烈净流入：占比 > 15%
  moderate: 0.05,  // 温和净流入：占比 > 5%
  weak: -0.05,     // 温和净流出：占比 < -5%
  strongOut: -0.15 // 强烈净流出：占比 < -15%
}

// 北向资金日均净买入阈值（亿元）
const NORTHBOUND_THRESHOLDS = {
  strong: 100,     // 大幅净买入
  moderate: 30,    // 温和净买入
  weak: -30,       // 温和净卖出
  strongOut: -100  // 大幅净卖出
}

/**
 * 计算主力资金子评分
 * 基于：主力净流入金额 + 净流入占比 + 连续流入天数
 */
function calculateMainForceScore(
  mainForceNet: number,
  totalVolume: number,
  consecutiveDays: number
): { score: number; direction: 'inflow' | 'outflow' | 'neutral'; details: string[] } {
  const details: string[] = []
  let score = 0

  // 1. 主力净流入占比评分（权重50%）
  const ratio = totalVolume > 0 ? mainForceNet / totalVolume : 0
  if (ratio > MAIN_FORCE_RATIO_THRESHOLDS.strong) {
    score += 35
    details.push(`主力强烈净流入，占比${(ratio * 100).toFixed(1)}%`)
  } else if (ratio > MAIN_FORCE_RATIO_THRESHOLDS.moderate) {
    score += 20
    details.push(`主力温和净流入，占比${(ratio * 100).toFixed(1)}%`)
  } else if (ratio < MAIN_FORCE_RATIO_THRESHOLDS.strongOut) {
    score -= 35
    details.push(`主力强烈净流出，占比${(Math.abs(ratio) * 100).toFixed(1)}%`)
  } else if (ratio < MAIN_FORCE_RATIO_THRESHOLDS.weak) {
    score -= 20
    details.push(`主力温和净流出，占比${(Math.abs(ratio) * 100).toFixed(1)}%`)
  }

  // 2. 主力净流入绝对金额评分（权重30%）
  const netInflowYi = mainForceNet / 10000 // 万元转亿元
  if (netInflowYi > 10) {
    score += 20
    details.push(`主力净流入${netInflowYi.toFixed(2)}亿元`)
  } else if (netInflowYi > 2) {
    score += 10
    details.push(`主力净流入${netInflowYi.toFixed(2)}亿元`)
  } else if (netInflowYi < -10) {
    score -= 20
    details.push(`主力净流出${Math.abs(netInflowYi).toFixed(2)}亿元`)
  } else if (netInflowYi < -2) {
    score -= 10
    details.push(`主力净流出${Math.abs(netInflowYi).toFixed(2)}亿元`)
  }

  // 3. 连续流入天数加分（权重20%）
  if (consecutiveDays >= 5) {
    score += 15
    details.push(`主力连续${consecutiveDays}天净流入`)
  } else if (consecutiveDays >= 3) {
    score += 8
    details.push(`主力连续${consecutiveDays}天净流入`)
  } else if (consecutiveDays <= -5) {
    score -= 15
    details.push(`主力连续${Math.abs(consecutiveDays)}天净流出`)
  } else if (consecutiveDays <= -3) {
    score -= 8
    details.push(`主力连续${Math.abs(consecutiveDays)}天净流出`)
  }

  const direction = score > 5 ? 'inflow' : score < -5 ? 'outflow' : 'neutral'
  return { score, direction, details }
}

/**
 * 计算北向资金子评分
 * 基于：北向净买入金额 + 连续流入天数
 */
function calculateNorthboundScore(
  northboundNet: number,
  consecutiveDays: number
): { score: number; direction: 'inflow' | 'outflow' | 'neutral'; details: string[] } {
  const details: string[] = []
  let score = 0

  // 1. 北向净买入金额评分（权重60%）
  const netInflowYi = northboundNet / 10000 // 万元转亿元
  if (netInflowYi > NORTHBOUND_THRESHOLDS.strong) {
    score += 40
    details.push(`北向大幅净买入${netInflowYi.toFixed(2)}亿元`)
  } else if (netInflowYi > NORTHBOUND_THRESHOLDS.moderate) {
    score += 25
    details.push(`北向温和净买入${netInflowYi.toFixed(2)}亿元`)
  } else if (netInflowYi < NORTHBOUND_THRESHOLDS.strongOut) {
    score -= 40
    details.push(`北向大幅净卖出${Math.abs(netInflowYi).toFixed(2)}亿元`)
  } else if (netInflowYi < NORTHBOUND_THRESHOLDS.weak) {
    score -= 25
    details.push(`北向温和净卖出${Math.abs(netInflowYi).toFixed(2)}亿元`)
  }

  // 2. 连续流入天数加分（权重40%）
  if (consecutiveDays >= 5) {
    score += 20
    details.push(`北向连续${consecutiveDays}天净买入`)
  } else if (consecutiveDays >= 3) {
    score += 10
    details.push(`北向连续${consecutiveDays}天净买入`)
  } else if (consecutiveDays <= -5) {
    score -= 20
    details.push(`北向连续${Math.abs(consecutiveDays)}天净卖出`)
  } else if (consecutiveDays <= -3) {
    score -= 10
    details.push(`北向连续${Math.abs(consecutiveDays)}天净卖出`)
  }

  const direction = score > 5 ? 'inflow' : score < -5 ? 'outflow' : 'neutral'
  return { score, direction, details }
}

/**
 * 计算融资融券子评分
 * 基于：融资余额变化率
 */
function calculateMarginScore(
  marginChangePct: number
): { score: number; details: string[] } {
  const details: string[] = []
  let score = 0

  if (marginChangePct > 3) {
    score += 30
    details.push(`融资余额大幅增长${marginChangePct.toFixed(2)}%`)
  } else if (marginChangePct > 1) {
    score += 15
    details.push(`融资余额温和增长${marginChangePct.toFixed(2)}%`)
  } else if (marginChangePct < -3) {
    score -= 30
    details.push(`融资余额大幅下降${Math.abs(marginChangePct).toFixed(2)}%`)
  } else if (marginChangePct < -1) {
    score -= 15
    details.push(`融资余额温和下降${Math.abs(marginChangePct).toFixed(2)}%`)
  } else {
    details.push(`融资余额变化不大`)
  }

  return { score, details }
}

/**
 * 计算资金流向综合评分
 *
 * 综合评分 = 主力资金 * 0.4 + 北向资金 * 0.35 + 融资融券 * 0.25
 * 最终分数限制在 -100 ~ 100
 *
 * @param input 资金流向输入数据
 * @returns 资金流向评分结果
 */
export function calculateCapitalFlowScore(input: CapitalFlowInput): CapitalFlowResult {
  const totalVolume = input.totalVolume || 0
  const mainConsecutive = input.mainForceConsecutiveDays || 0
  const northConsecutive = input.northboundConsecutiveDays || 0
  const marginChange = input.marginChangePct || 0

  // 计算各维度子评分
  const mainForceResult = calculateMainForceScore(
    input.mainForceNet,
    totalVolume,
    mainConsecutive
  )
  const northboundResult = calculateNorthboundScore(
    input.northboundNet,
    northConsecutive
  )
  const marginResult = calculateMarginScore(marginChange)

  // 加权综合评分
  const rawScore =
    mainForceResult.score * 0.4 +
    northboundResult.score * 0.35 +
    marginResult.score * 0.25

  // 限制在 -100 ~ 100
  const score = Math.max(-100, Math.min(100, Math.round(rawScore)))

  // 判断资金共振（主力+北向同向流入或流出）
  const resonance =
    (mainForceResult.direction === 'inflow' && northboundResult.direction === 'inflow') ||
    (mainForceResult.direction === 'outflow' && northboundResult.direction === 'outflow')

  // 汇总详情
  const details: string[] = [
    ...mainForceResult.details,
    ...northboundResult.details,
    ...marginResult.details,
  ]
  if (resonance) {
    details.push(
      mainForceResult.direction === 'inflow'
        ? '主力与北向资金共振流入，看多信号增强'
        : '主力与北向资金共振流出，看空信号增强'
    )
  }

  return {
    score,
    mainForceScore: mainForceResult.score,
    northboundScore: northboundResult.score,
    marginScore: marginResult.score,
    mainForceDirection: mainForceResult.direction,
    northboundDirection: northboundResult.direction,
    resonance,
    details,
  }
}

/**
 * 从宏观资金流向数据提取ETF相关资金信号
 *
 * 当没有ETF级别资金数据时，使用宏观数据作为代理
 */
export function estimateCapitalFlowFromMacro(
  macroData: {
    northbound?: { net: number; change: number }
    margin?: { balance: number; change: number }
    etf?: { netPurchase: number; change: number }
    sectors?: Array<{ name: string; capital: number; change: number }>
  },
  sectorKeywords?: string[]
): CapitalFlowInput {
  // 北向资金：net 单位是元，转为万元
  const northboundNet = (macroData.northbound?.net || 0) / 10000

  // 融资余额变化率
  const marginChangePct = macroData.margin?.change || 0

  // 从板块数据中提取主力净流入
  let mainForceNet = 0
  if (macroData.sectors && sectorKeywords) {
    const matchedSectors = macroData.sectors.filter(s =>
      sectorKeywords.some(kw => s.name.includes(kw))
    )
    mainForceNet = matchedSectors.reduce((sum, s) => sum + s.capital, 0) / 10000 // 元转万元
  }

  // ETF净申购作为额外信号
  if (macroData.etf?.netPurchase) {
    mainForceNet += macroData.etf.netPurchase / 10000
  }

  return {
    mainForceNet,
    northboundNet,
    marginChangePct,
    totalVolume: 0,
    mainForceConsecutiveDays: 0,
    northboundConsecutiveDays: 0,
  }
}
