// 成交量类技术指标计算
// OBV、VWAP、量比、换手率

export interface VolumeIndicators {
  obv: number
  vwap: number
  volumeRatio: number
  turnoverRate: number
}

/**
 * 计算OBV (能量潮)
 */
export function calculateOBV(closes: number[], volumes: number[]): number {
  if (closes.length < 2 || volumes.length < 2) {
    return 0
  }

  let obv = 0

  for (let i = 1; i < closes.length; i++) {
    if (closes[i] > closes[i - 1]) {
      obv += volumes[i]
    } else if (closes[i] < closes[i - 1]) {
      obv -= volumes[i]
    }
    // 收盘价不变时OBV不变
  }

  return obv
}

/**
 * 计算VWAP (成交量加权平均价)
 * 通常用于日内计算
 */
export function calculateVWAP(
  highs: number[],
  lows: number[],
  closes: number[],
  volumes: number[]
): number {
  if (closes.length === 0) {
    return 0
  }

  let totalVolume = 0
  let totalTPVolume = 0

  for (let i = 0; i < closes.length; i++) {
    const tp = (highs[i] + lows[i] + closes[i]) / 3
    totalTPVolume += tp * volumes[i]
    totalVolume += volumes[i]
  }

  if (totalVolume === 0) {
    return closes[closes.length - 1]
  }

  return totalTPVolume / totalVolume
}

/**
 * 计算量比
 * 量比 = 当日成交量 / 过去N日平均成交量
 */
export function calculateVolumeRatio(
  volumes: number[],
  period: number = 5
): number {
  if (volumes.length < period + 1) {
    return 1
  }

  const currentVolume = volumes[volumes.length - 1]
  const pastVolumes = volumes.slice(-(period + 1), -1)
  const avgVolume = pastVolumes.reduce((a, b) => a + b, 0) / period

  if (avgVolume === 0) {
    return 1
  }

  return currentVolume / avgVolume
}

/**
 * 计算换手率
 * 换手率 = 成交量 / 流通股本 * 100%
 * 需要流通股本数据，这里简化处理
 */
export function calculateTurnoverRate(
  volume: number,
  floatShares: number
): number {
  if (floatShares === 0) {
    return 0
  }

  return (volume / floatShares) * 100
}

/**
 * 判断是否放量
 */
export function isVolumeAbnormal(volumeRatio: number): boolean {
  return volumeRatio > 2.0 || volumeRatio < 0.5
}

/**
 * 判断放量上涨
 */
export function isVolumeUpTrend(
  close: number,
  prevClose: number,
  volumeRatio: number
): boolean {
  return close > prevClose && volumeRatio > 1.5
}

/**
 * 判断缩量下跌
 */
export function isVolumeDownTrend(
  close: number,
  prevClose: number,
  volumeRatio: number
): boolean {
  return close < prevClose && volumeRatio < 0.7
}
