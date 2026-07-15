// 趋势类技术指标计算
// MA、MACD、DMI、BOLL、SAR

export interface MAResult {
  ma5: number
  ma10: number
  ma20: number
  ma60: number
  ma120?: number
  ma250?: number
}

export interface MACDResult {
  dif: number
  dea: number
  macd: number
}

export interface DMIResult {
  pdi: number  // +DI
  mdi: number  // -DI
  adx: number
  adxr: number
}

export interface BOLLResult {
  upper: number   // 上轨
  middle: number  // 中轨
  lower: number   // 下轨
  bandwidth: number  // 带宽
  percentB: number   // %B指标
}

export interface SARResult {
  sar: number        // SAR值
  isLong: boolean    // 是否多头
  af: number         // 加速因子
  ep: number         // 极点值
}

/**
 * 计算移动平均线
 */
export function calculateMA(closes: number[], periods: number[]): { [key: string]: number } {
  const result: { [key: string]: number } = {}

  for (const period of periods) {
    if (closes.length >= period) {
      const slice = closes.slice(-period)
      result[`ma${period}`] = slice.reduce((a, b) => a + b, 0) / period
    } else {
      result[`ma${period}`] = closes[closes.length - 1] || 0
    }
  }

  return result
}

/**
 * 计算EMA
 */
function calculateEMA(data: number[], period: number): number[] {
  const ema: number[] = []
  const multiplier = 2 / (period + 1)

  // 第一个值使用SMA
  ema[0] = data.slice(0, period).reduce((a, b) => a + b, 0) / period

  for (let i = 1; i < data.length; i++) {
    ema[i] = (data[i] - ema[i - 1]) * multiplier + ema[i - 1]
  }

  return ema
}

/**
 * 计算MACD (12, 26, 9)
 */
export function calculateMACD(closes: number[]): MACDResult {
  if (closes.length < 26) {
    return { dif: 0, dea: 0, macd: 0 }
  }

  const ema12 = calculateEMA(closes, 12)
  const ema26 = calculateEMA(closes, 26)

  // DIF = EMA12 - EMA26
  const dif: number[] = []
  for (let i = 0; i < closes.length; i++) {
    dif[i] = (ema12[i] || 0) - (ema26[i] || 0)
  }

  // DEA = DIF的9日EMA
  const dea = calculateEMA(dif, 9)

  // MACD = (DIF - DEA) * 2
  const lastDif = dif[dif.length - 1] || 0
  const lastDea = dea[dea.length - 1] || 0
  const macd = (lastDif - lastDea) * 2

  return {
    dif: lastDif,
    dea: lastDea,
    macd: macd
  }
}

/**
 * 计算DMI (14, 14) - 完整算法
 *
 * 1. 计算 TR、+DM、-DM
 * 2. 平滑 TR、+DM、-DM（EMA）
 * 3. 计算 +DI、-DI
 * 4. 计算 DX = |+DI - -DI| / (+DI + -DI) * 100
 * 5. ADX = EMA(DX, period)
 * 6. ADXR = (当前ADX + period日前的ADX) / 2
 */
export function calculateDMI(
  highs: number[],
  lows: number[],
  closes: number[],
  period: number = 14
): DMIResult {
  if (highs.length < period + 1) {
    return { pdi: 0, mdi: 0, adx: 0, adxr: 0 }
  }

  // 计算TR、+DM、-DM
  const tr: number[] = []
  const pdm: number[] = []
  const mdm: number[] = []

  for (let i = 1; i < highs.length; i++) {
    const highDiff = highs[i] - highs[i - 1]
    const lowDiff = lows[i - 1] - lows[i]

    tr.push(Math.max(
      highs[i] - lows[i],
      Math.abs(highs[i] - closes[i - 1]),
      Math.abs(lows[i] - closes[i - 1])
    ))

    pdm.push(highDiff > lowDiff && highDiff > 0 ? highDiff : 0)
    mdm.push(lowDiff > highDiff && lowDiff > 0 ? lowDiff : 0)
  }

  // 平滑 TR、+DM、-DM
  const smoothTR = calculateEMA(tr, period)
  const smoothPDM = calculateEMA(pdm, period)
  const smoothMDM = calculateEMA(mdm, period)

  // 计算每个周期的 +DI、-DI 和 DX
  const dxSeries: number[] = []
  for (let i = 0; i < smoothTR.length; i++) {
    const trVal = smoothTR[i] || 1
    const pdiVal = ((smoothPDM[i] || 0) / trVal) * 100
    const mdiVal = ((smoothMDM[i] || 0) / trVal) * 100
    const diSum = pdiVal + mdiVal
    if (diSum > 0) {
      dxSeries.push(Math.abs(pdiVal - mdiVal) / diSum * 100)
    } else {
      dxSeries.push(0)
    }
  }

  // ADX = EMA(DX, period)
  const adxSeries = calculateEMA(dxSeries, period)
  const adx = adxSeries[adxSeries.length - 1] || 0

  // ADXR = (当前ADX + period日前的ADX) / 2
  const adxPeriodAgo = adxSeries.length > period
    ? adxSeries[adxSeries.length - 1 - period]
    : adx
  const adxr = (adx + adxPeriodAgo) / 2

  // 最终的 +DI、-DI
  const lastTR = smoothTR[smoothTR.length - 1] || 1
  const pdi = ((smoothPDM[smoothPDM.length - 1] || 0) / lastTR) * 100
  const mdi = ((smoothMDM[smoothMDM.length - 1] || 0) / lastTR) * 100

  return {
    pdi: Math.round(pdi * 100) / 100,
    mdi: Math.round(mdi * 100) / 100,
    adx: Math.round(adx * 100) / 100,
    adxr: Math.round(adxr * 100) / 100
  }
}

/**
 * 计算布林带 (BOLL) - 20日，2倍标准差
 *
 * 中轨 = MA(20)
 * 标准差 = STDEV(20)
 * 上轨 = 中轨 + 2 * 标准差
 * 下轨 = 中轨 - 2 * 标准差
 * 带宽 = (上轨 - 下轨) / 中轨
 * %B = (收盘价 - 下轨) / (上轨 - 下轨)
 */
export function calculateBOLL(
  closes: number[],
  period: number = 20,
  multiplier: number = 2
): BOLLResult {
  if (closes.length < period) {
    const lastPrice = closes[closes.length - 1] || 0
    return {
      upper: lastPrice,
      middle: lastPrice,
      lower: lastPrice,
      bandwidth: 0,
      percentB: 0.5,
    }
  }

  // 计算中轨 (MA20)
  const recentCloses = closes.slice(-period)
  const middle = recentCloses.reduce((a, b) => a + b, 0) / period

  // 计算标准差
  const squaredDiffs = recentCloses.map(c => Math.pow(c - middle, 2))
  const variance = squaredDiffs.reduce((a, b) => a + b, 0) / period
  const stdDev = Math.sqrt(variance)

  // 计算上轨和下轨
  const upper = middle + multiplier * stdDev
  const lower = middle - multiplier * stdDev

  // 计算带宽
  const bandwidth = middle > 0 ? (upper - lower) / middle : 0

  // 计算%B
  const currentPrice = closes[closes.length - 1]
  const percentB = (upper - lower) > 0
    ? (currentPrice - lower) / (upper - lower)
    : 0.5

  return {
    upper: Math.round(upper * 100) / 100,
    middle: Math.round(middle * 100) / 100,
    lower: Math.round(lower * 100) / 100,
    bandwidth: Math.round(bandwidth * 10000) / 10000,
    percentB: Math.round(percentB * 10000) / 10000,
  }
}

/**
 * 计算抛物线SAR (Parabolic SAR)
 *
 * 初始AF = 0.02
 * AF步长 = 0.02
 * AF最大值 = 0.20
 *
 * 多头：SAR = 前SAR + AF * (EP - 前SAR)
 * 空头：SAR = 前SAR + AF * (EP - 前SAR)
 */
export function calculateSAR(
  highs: number[],
  lows: number[],
  closes: number[],
  initialAF: number = 0.02,
  afStep: number = 0.02,
  maxAF: number = 0.20
): SARResult {
  if (highs.length < 2) {
    return {
      sar: closes[closes.length - 1] || 0,
      isLong: true,
      af: initialAF,
      ep: highs[highs.length - 1] || 0,
    }
  }

  // 初始化：假设多头开始
  let isLong = true
  let sar = lows[0]
  let ep = highs[0]
  let af = initialAF

  for (let i = 1; i < highs.length; i++) {
    const prevSar = sar

    // 计算新SAR
    sar = prevSar + af * (ep - prevSar)

    if (isLong) {
      // 多头处理
      // SAR不能高于前两根K线的最低点
      if (i >= 2) {
        sar = Math.min(sar, lows[i - 1], lows[i - 2])
      } else {
        sar = Math.min(sar, lows[i - 1])
      }

      // 检查是否反转
      if (lows[i] < sar) {
        // 反转为空头
        isLong = false
        sar = ep
        ep = lows[i]
        af = initialAF
      } else {
        // 继续多头
        if (highs[i] > ep) {
          ep = highs[i]
          af = Math.min(af + afStep, maxAF)
        }
      }
    } else {
      // 空头处理
      // SAR不能低于前两根K线的最高点
      if (i >= 2) {
        sar = Math.max(sar, highs[i - 1], highs[i - 2])
      } else {
        sar = Math.max(sar, highs[i - 1])
      }

      // 检查是否反转
      if (highs[i] > sar) {
        // 反转为多头
        isLong = true
        sar = ep
        ep = highs[i]
        af = initialAF
      } else {
        // 继续空头
        if (lows[i] < ep) {
          ep = lows[i]
          af = Math.min(af + afStep, maxAF)
        }
      }
    }
  }

  return {
    sar: Math.round(sar * 100) / 100,
    isLong,
    af: Math.round(af * 10000) / 10000,
    ep: Math.round(ep * 100) / 100,
  }
}

/**
 * 判断MA多头排列
 */
export function isMABullish(ma: MAResult): boolean {
  return ma.ma5 > ma.ma10 && ma.ma10 > ma.ma20 && ma.ma20 > ma.ma60
}

/**
 * 判断MA空头排列
 */
export function isMABearish(ma: MAResult): boolean {
  return ma.ma5 < ma.ma10 && ma.ma10 < ma.ma20 && ma.ma20 < ma.ma60
}

/**
 * MACD金叉判断
 */
export function isMACDGoldenCross(prevDIF: number, prevDEA: number, currDIF: number, currDEA: number): boolean {
  return prevDIF <= prevDEA && currDIF > currDEA
}

/**
 * MACD死叉判断
 */
export function isMACDDeathCross(prevDIF: number, prevDEA: number, currDIF: number, currDEA: number): boolean {
  return prevDIF >= prevDEA && currDIF < currDEA
}
