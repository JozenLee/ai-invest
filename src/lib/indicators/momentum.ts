// 动量类技术指标计算
// RSI、KDJ、CCI、WR

export interface RSIResult {
  rsi6: number
  rsi12: number
  rsi24: number
}

export interface KDJResult {
  k: number
  d: number
  j: number
}

/**
 * 计算RSI
 * @param closes 收盘价数组
 * @param period 计算周期
 */
export function calculateRSI(closes: number[], periods: number[] = [6, 12, 24]): RSIResult {
  const result: RSIResult = { rsi6: 50, rsi12: 50, rsi24: 50 }

  for (const period of periods) {
    if (closes.length < period + 1) {
      continue
    }

    let gains = 0
    let losses = 0

    // 计算最近period天的涨跌
    for (let i = closes.length - period; i < closes.length; i++) {
      const change = closes[i] - closes[i - 1]
      if (change > 0) {
        gains += change
      } else {
        losses += Math.abs(change)
      }
    }

    const avgGain = gains / period
    const avgLoss = losses / period

    if (avgLoss === 0) {
      result[`rsi${period}` as keyof RSIResult] = 100
    } else {
      const rs = avgGain / avgLoss
      result[`rsi${period}` as keyof RSIResult] = 100 - (100 / (1 + rs))
    }
  }

  return result
}

/**
 * 计算KDJ (9, 3, 3) - 完整递推算法
 *
 * RSV = (C - LN) / (HN - LN) * 100
 * K = 2/3 * prevK + 1/3 * RSV
 * D = 2/3 * prevD + 1/3 * K
 * J = 3K - 2D
 */
export function calculateKDJ(
  highs: number[],
  lows: number[],
  closes: number[],
  period: number = 9
): KDJResult {
  if (closes.length < period) {
    return { k: 50, d: 50, j: 50 }
  }

  let k = 50  // 初始值
  let d = 50  // 初始值

  // 从第 period 个数据开始递推
  for (let i = period - 1; i < closes.length; i++) {
    const windowHighs = highs.slice(i - period + 1, i + 1)
    const windowLows = lows.slice(i - period + 1, i + 1)
    const highestHigh = Math.max(...windowHighs)
    const lowestLow = Math.min(...windowLows)

    if (highestHigh === lowestLow) {
      // RSV 为 50 时保持不变
      k = (2 / 3) * k + (1 / 3) * 50
      d = (2 / 3) * d + (1 / 3) * k
    } else {
      const rsv = ((closes[i] - lowestLow) / (highestHigh - lowestLow)) * 100
      k = (2 / 3) * k + (1 / 3) * rsv
      d = (2 / 3) * d + (1 / 3) * k
    }
  }

  const j = 3 * k - 2 * d

  return {
    k: Math.round(k * 100) / 100,
    d: Math.round(d * 100) / 100,
    j: Math.round(j * 100) / 100
  }
}

/**
 * 计算CCI (14)
 */
export function calculateCCI(
  highs: number[],
  lows: number[],
  closes: number[],
  period: number = 14
): number {
  if (closes.length < period) {
    return 0
  }

  // 计算TP (典型价格)
  const tp: number[] = []
  for (let i = 0; i < closes.length; i++) {
    tp.push((highs[i] + lows[i] + closes[i]) / 3)
  }

  // 计算TP的SMA
  const recentTP = tp.slice(-period)
  const smaTP = recentTP.reduce((a, b) => a + b, 0) / period

  // 计算平均偏差
  const meanDeviation = recentTP.reduce((sum, val) => sum + Math.abs(val - smaTP), 0) / period

  if (meanDeviation === 0) {
    return 0
  }

  // CCI = (TP - SMA) / (0.015 * 平均偏差)
  const currentTP = tp[tp.length - 1]
  return (currentTP - smaTP) / (0.015 * meanDeviation)
}

/**
 * 计算威廉指标WR (14)
 */
export function calculateWR(
  highs: number[],
  lows: number[],
  closes: number[],
  period: number = 14
): number {
  if (closes.length < period) {
    return 50
  }

  const recentHighs = highs.slice(-period)
  const recentLows = lows.slice(-period)
  const highestHigh = Math.max(...recentHighs)
  const lowestLow = Math.min(...recentLows)

  const currentClose = closes[closes.length - 1]

  if (highestHigh === lowestLow) {
    return 50
  }

  // WR = (HN - C) / (HN - LN) * -100
  return ((highestHigh - currentClose) / (highestHigh - lowestLow)) * -100
}

/**
 * RSI超买判断
 */
export function isRSIOverbought(rsi: number): boolean {
  return rsi > 70
}

/**
 * RSI超卖判断
 */
export function isRSIOversold(rsi: number): boolean {
  return rsi < 30
}

/**
 * KDJ金叉判断
 */
export function isKDJGoldenCross(prevK: number, prevD: number, currK: number, currD: number): boolean {
  return prevK <= prevD && currK > currD
}

/**
 * KDJ死叉判断
 */
export function isKDJDeathCross(prevK: number, prevD: number, currK: number, currD: number): boolean {
  return prevK >= prevD && currK < currD
}
