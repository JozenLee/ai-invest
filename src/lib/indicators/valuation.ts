// 估值指标计算
// PE/PB 百分位 → 评分 -100 到 100

export interface ValuationInput {
  /** 市盈率 PE(TTM) */
  pe: number
  /** PE 历史百分位（0~100） */
  pePercentile: number
  /** 市净率 PB */
  pb: number
  /** PB 历史百分位（0~100） */
  pbPercentile: number
  /** 市销率 PS（可选） */
  ps?: number
  /** PS 历史百分位（可选） */
  psPercentile?: number
  /** 行业平均 PE（用于相对估值） */
  industryPe?: number
  /** 行业平均 PB（用于相对估值） */
  industryPb?: number
}

export interface ValuationResult {
  /** 综合估值评分 -100 ~ 100（正 = 低估，负 = 高估） */
  score: number
  /** PE 子评分 */
  peScore: number
  /** PB 子评分 */
  pbScore: number
  /** PS 子评分（如有数据） */
  psScore?: number
  /** 估值评级 */
  rating: 'undervalued' | 'fair' | 'overvalued'
  /** 信号详情 */
  details: string[]
}

// PE 百分位阈值
const PE_PERCENTILE_THRESHOLDS = {
  veryLow: 10,    // 极度低估
  low: 30,        // 低估
  fair: 50,       // 合理
  high: 70,       // 高估
  veryHigh: 90,   // 极度高估
}

// PB 百分位阈值
const PB_PERCENTILE_THRESHOLDS = {
  veryLow: 10,
  low: 30,
  fair: 50,
  high: 70,
  veryHigh: 90,
}

/**
 * 根据百分位计算评分
 * 百分位越低 → 评分越高（越低估越值得买入）
 *
 * 映射逻辑：
 * - 百分位 0~10: 评分 +40 ~ +50（极度低估）
 * - 百分位 10~30: 评分 +15 ~ +40（低估）
 * - 百分位 30~70: 评分 -15 ~ +15（合理）
 * - 百分位 70~90: 评分 -40 ~ -15（高估）
 * - 百分位 90~100: 评分 -50 ~ -40（极度高估）
 */
function percentileToScore(percentile: number): number {
  if (percentile <= PE_PERCENTILE_THRESHOLDS.veryLow) {
    return 40 + (PE_PERCENTILE_THRESHOLDS.veryLow - percentile) * 1
  } else if (percentile <= PE_PERCENTILE_THRESHOLDS.low) {
    return 15 + (PE_PERCENTILE_THRESHOLDS.low - percentile) * 1.25
  } else if (percentile <= PE_PERCENTILE_THRESHOLDS.fair) {
    return (PE_PERCENTILE_THRESHOLDS.fair - percentile) * 0.6
  } else if (percentile <= PE_PERCENTILE_THRESHOLDS.high) {
    return (PE_PERCENTILE_THRESHOLDS.fair - percentile) * 0.6
  } else if (percentile <= PE_PERCENTILE_THRESHOLDS.veryHigh) {
    return -15 - (percentile - PE_PERCENTILE_THRESHOLDS.high) * 1.25
  } else {
    return -40 - (percentile - PE_PERCENTILE_THRESHOLDS.veryHigh) * 1
  }
}

/**
 * 计算 PE 评分
 * 绝对百分位评分 + 相对行业估值修正
 */
function calculatePeScore(
  pe: number,
  pePercentile: number,
  industryPe?: number
): { score: number; details: string[] } {
  const details: string[] = []
  let score = percentileToScore(pePercentile)

  // 百分位描述
  if (pePercentile <= PE_PERCENTILE_THRESHOLDS.veryLow) {
    details.push(`PE处于历史极低位(${pePercentile.toFixed(1)}%)，PE=${pe.toFixed(1)}`)
  } else if (pePercentile <= PE_PERCENTILE_THRESHOLDS.low) {
    details.push(`PE处于历史低位(${pePercentile.toFixed(1)}%)，PE=${pe.toFixed(1)}`)
  } else if (pePercentile <= PE_PERCENTILE_THRESHOLDS.high) {
    details.push(`PE处于历史中位(${pePercentile.toFixed(1)}%)，PE=${pe.toFixed(1)}`)
  } else if (pePercentile <= PE_PERCENTILE_THRESHOLDS.veryHigh) {
    details.push(`PE处于历史高位(${pePercentile.toFixed(1)}%)，PE=${pe.toFixed(1)}`)
  } else {
    details.push(`PE处于历史极高位(${pePercentile.toFixed(1)}%)，PE=${pe.toFixed(1)}`)
  }

  // 行业相对估值修正
  if (industryPe && industryPe > 0 && pe > 0) {
    const relativePe = pe / industryPe
    if (relativePe < 0.7) {
      score += 10
      details.push(`PE低于行业均值30%以上，相对低估`)
    } else if (relativePe < 0.9) {
      score += 5
      details.push(`PE低于行业均值，相对低估`)
    } else if (relativePe > 1.3) {
      score -= 10
      details.push(`PE高于行业均值30%以上，相对高估`)
    } else if (relativePe > 1.1) {
      score -= 5
      details.push(`PE高于行业均值，相对高估`)
    }
  }

  // 负PE警告
  if (pe < 0) {
    score -= 15
    details.push('PE为负，公司亏损')
  }

  return { score: Math.max(-50, Math.min(50, score)), details }
}

/**
 * 计算 PB 评分
 */
function calculatePbScore(
  pb: number,
  pbPercentile: number,
  industryPb?: number
): { score: number; details: string[] } {
  const details: string[] = []
  let score = percentileToScore(pbPercentile)

  // 百分位描述
  if (pbPercentile <= PB_PERCENTILE_THRESHOLDS.veryLow) {
    details.push(`PB处于历史极低位(${pbPercentile.toFixed(1)}%)，PB=${pb.toFixed(2)}`)
  } else if (pbPercentile <= PB_PERCENTILE_THRESHOLDS.low) {
    details.push(`PB处于历史低位(${pbPercentile.toFixed(1)}%)，PB=${pb.toFixed(2)}`)
  } else if (pbPercentile <= PB_PERCENTILE_THRESHOLDS.high) {
    details.push(`PB处于历史中位(${pbPercentile.toFixed(1)}%)，PB=${pb.toFixed(2)}`)
  } else if (pbPercentile <= PB_PERCENTILE_THRESHOLDS.veryHigh) {
    details.push(`PB处于历史高位(${pbPercentile.toFixed(1)}%)，PB=${pb.toFixed(2)}`)
  } else {
    details.push(`PB处于历史极高位(${pbPercentile.toFixed(1)}%)，PB=${pb.toFixed(2)}`)
  }

  // 行业相对估值修正
  if (industryPb && industryPb > 0 && pb > 0) {
    const relativePb = pb / industryPb
    if (relativePb < 0.7) {
      score += 10
      details.push(`PB低于行业均值30%以上，相对低估`)
    } else if (relativePb < 0.9) {
      score += 5
      details.push(`PB低于行业均值，相对低估`)
    } else if (relativePb > 1.3) {
      score -= 10
      details.push(`PB高于行业均值30%以上，相对高估`)
    } else if (relativePb > 1.1) {
      score -= 5
      details.push(`PB高于行业均值，相对高估`)
    }
  }

  return { score: Math.max(-50, Math.min(50, score)), details }
}

/**
 * 计算 PS 评分（可选）
 */
function calculatePsScore(
  ps: number,
  psPercentile: number
): { score: number; details: string[] } {
  const details: string[] = []
  const score = percentileToScore(psPercentile)

  if (psPercentile <= 30) {
    details.push(`PS处于历史低位(${psPercentile.toFixed(1)}%)，PS=${ps.toFixed(2)}`)
  } else if (psPercentile >= 70) {
    details.push(`PS处于历史高位(${psPercentile.toFixed(1)}%)，PS=${ps.toFixed(2)}`)
  } else {
    details.push(`PS处于历史中位(${psPercentile.toFixed(1)}%)`)
  }

  return { score: Math.max(-50, Math.min(50, score)), details }
}

/**
 * 计算估值综合评分
 *
 * 综合评分 = PE评分 * 0.5 + PB评分 * 0.4 + PS评分 * 0.1（如有）
 * 最终分数限制在 -100 ~ 100
 *
 * 评分含义：
 * - 正值 = 低估（适合买入）
 * - 负值 = 高估（谨慎持有）
 *
 * @param input 估值输入数据
 * @returns 估值评分结果
 */
export function calculateValuationScore(input: ValuationInput): ValuationResult {
  const peResult = calculatePeScore(input.pe, input.pePercentile, input.industryPe)
  const pbResult = calculatePbScore(input.pb, input.pbPercentile, input.industryPb)

  let psResult: { score: number; details: string[] } | undefined
  if (input.ps !== undefined && input.psPercentile !== undefined) {
    psResult = calculatePsScore(input.ps, input.psPercentile)
  }

  // 加权综合评分
  let rawScore: number
  if (psResult) {
    rawScore = peResult.score * 0.5 + pbResult.score * 0.4 + psResult.score * 0.1
  } else {
    // 没有PS数据时，PE权重提升到55%，PB权重提升到45%
    rawScore = peResult.score * 0.55 + pbResult.score * 0.45
  }

  // 限制在 -100 ~ 100
  const score = Math.max(-100, Math.min(100, Math.round(rawScore)))

  // 确定估值评级
  let rating: 'undervalued' | 'fair' | 'overvalued'
  if (score > 20) {
    rating = 'undervalued'
  } else if (score < -20) {
    rating = 'overvalued'
  } else {
    rating = 'fair'
  }

  // 汇总详情
  const details: string[] = [
    ...peResult.details,
    ...pbResult.details,
    ...(psResult?.details || []),
  ]

  // 综合判断
  if (rating === 'undervalued') {
    details.push('综合估值偏低，具有安全边际')
  } else if (rating === 'overvalued') {
    details.push('综合估值偏高，注意估值风险')
  } else {
    details.push('综合估值合理')
  }

  return {
    score,
    peScore: peResult.score,
    pbScore: pbResult.score,
    psScore: psResult?.score,
    rating,
    details,
  }
}

/**
 * 从市场数据提取估值输入
 * 当没有直接的百分位数据时，使用近似值
 */
export function buildValuationInput(
  pe: number,
  pb: number,
  pePercentile?: number,
  pbPercentile?: number,
  ps?: number,
  psPercentile?: number,
  industryPe?: number,
  industryPb?: number
): ValuationInput {
  return {
    pe,
    pePercentile: pePercentile ?? estimatePercentile(pe, 'pe'),
    pb,
    pbPercentile: pbPercentile ?? estimatePercentile(pb, 'pb'),
    ps,
    psPercentile,
    industryPe,
    industryPb,
  }
}

/**
 * 估算百分位（当没有历史数据时的降级方案）
 * 使用经验分布进行粗略估计
 */
function estimatePercentile(value: number, type: 'pe' | 'pb'): number {
  if (value <= 0) return 50 // 负值无法估算

  if (type === 'pe') {
    // A股宽基指数PE经验分布
    if (value < 10) return 10
    if (value < 15) return 25
    if (value < 20) return 50
    if (value < 30) return 70
    if (value < 50) return 85
    return 95
  } else {
    // PB经验分布
    if (value < 1) return 10
    if (value < 1.5) return 25
    if (value < 2) return 50
    if (value < 3) return 70
    if (value < 5) return 85
    return 95
  }
}
