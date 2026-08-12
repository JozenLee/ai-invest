/**
 * Stability Indicators - 企稳指标计算
 * 包括波动率、布林带、支撑位等企稳相关指标
 */

interface PriceData {
  close: number;
  high: number;
  low: number;
  volume?: number;
}

/**
 * 计算历史波动率 (Historical Volatility)
 */
export function calculateVolatility(
  prices: number[],
  period: number = 20
): number {
  if (prices.length < period) return 0;

  const returns: number[] = [];
  for (let i = 1; i < prices.length; i++) {
    returns.push(Math.log(prices[i] / prices[i - 1]));
  }

  const mean = returns.reduce((sum, r) => sum + r, 0) / returns.length;
  const variance =
    returns.reduce((sum, r) => sum + Math.pow(r - mean, 2), 0) /
    (returns.length - 1);

  // 年化波动率
  return Math.sqrt(variance) * Math.sqrt(252);
}

/**
 * 计算布林带 (Bollinger Bands)
 */
export interface BollingerBands {
  upper: number;
  middle: number;
  lower: number;
  bandwidth: number; // 带宽，衡量波动性
  percentB: number; // %B指标，价格在带内的相对位置
}

export function calculateBollingerBands(
  prices: number[],
  period: number = 20,
  stdDev: number = 2
): BollingerBands | null {
  if (prices.length < period) return null;

  // 计算中轨（SMA）
  const recentPrices = prices.slice(-period);
  const middle =
    recentPrices.reduce((sum, p) => sum + p, 0) / recentPrices.length;

  // 计算标准差
  const variance =
    recentPrices.reduce((sum, p) => sum + Math.pow(p - middle, 2), 0) /
    recentPrices.length;
  const sd = Math.sqrt(variance);

  // 计算上下轨
  const upper = middle + stdDev * sd;
  const lower = middle - stdDev * sd;

  // 计算带宽
  const bandwidth = ((upper - lower) / middle) * 100;

  // 计算%B
  const currentPrice = prices[prices.length - 1];
  const percentB = (currentPrice - lower) / (upper - lower);

  return {
    upper,
    middle,
    lower,
    bandwidth,
    percentB,
  };
}

/**
 * 识别支撑位和压力位
 */
export interface SupportResistanceLevels {
  support: number[]; // 支撑位列表
  resistance: number[]; // 压力位列表
  currentPrice: number;
  nearestSupport: number | null;
  nearestResistance: number | null;
}

export function findSupportResistance(
  data: PriceData[],
  lookbackPeriod: number = 60,
  threshold: number = 0.02 // 2%的价格容差
): SupportResistanceLevels {
  if (data.length < lookbackPeriod) {
    const currentPrice = data[data.length - 1].close;
    return {
      support: [],
      resistance: [],
      currentPrice,
      nearestSupport: null,
      nearestResistance: null,
    };
  }

  const recentData = data.slice(-lookbackPeriod);
  const currentPrice = recentData[recentData.length - 1].close;

  const peaks: number[] = []; // 波峰
  const troughs: number[] = []; // 波谷

  // 识别局部极值点
  for (let i = 2; i < recentData.length - 2; i++) {
    const prev2 = recentData[i - 2].high;
    const prev1 = recentData[i - 1].high;
    const curr = recentData[i].high;
    const next1 = recentData[i + 1].high;
    const next2 = recentData[i + 2].high;

    // 波峰
    if (curr > prev2 && curr > prev1 && curr > next1 && curr > next2) {
      peaks.push(curr);
    }

    const tPrev2 = recentData[i - 2].low;
    const tPrev1 = recentData[i - 1].low;
    const tCurr = recentData[i].low;
    const tNext1 = recentData[i + 1].low;
    const tNext2 = recentData[i + 2].low;

    // 波谷
    if (tCurr < tPrev2 && tCurr < tPrev1 && tCurr < tNext1 && tCurr < tNext2) {
      troughs.push(tCurr);
    }
  }

  // 聚类相近的价格水平
  const clusterLevels = (levels: number[]): number[] => {
    if (levels.length === 0) return [];

    const sorted = [...levels].sort((a, b) => a - b);
    const clusters: number[][] = [[sorted[0]]];

    for (let i = 1; i < sorted.length; i++) {
      const lastCluster = clusters[clusters.length - 1];
      const lastAvg =
        lastCluster.reduce((sum, v) => sum + v, 0) / lastCluster.length;

      if (Math.abs(sorted[i] - lastAvg) / lastAvg <= threshold) {
        lastCluster.push(sorted[i]);
      } else {
        clusters.push([sorted[i]]);
      }
    }

    return clusters.map(
      (cluster) => cluster.reduce((sum, v) => sum + v, 0) / cluster.length
    );
  };

  const support = clusterLevels(troughs).filter((s) => s < currentPrice);
  const resistance = clusterLevels(peaks).filter((r) => r > currentPrice);

  // 找到最近的支撑位和压力位
  const nearestSupport =
    support.length > 0 ? Math.max(...support) : null;
  const nearestResistance =
    resistance.length > 0 ? Math.min(...resistance) : null;

  return {
    support: support.sort((a, b) => b - a), // 降序
    resistance: resistance.sort((a, b) => a - b), // 升序
    currentPrice,
    nearestSupport,
    nearestResistance,
  };
}

/**
 * 计算ATR（平均真实波幅）
 */
export function calculateATR(
  data: PriceData[],
  period: number = 14
): number | null {
  if (data.length < period + 1) return null;

  const trueRanges: number[] = [];

  for (let i = 1; i < data.length; i++) {
    const high = data[i].high;
    const low = data[i].low;
    const prevClose = data[i - 1].close;

    const tr = Math.max(
      high - low,
      Math.abs(high - prevClose),
      Math.abs(low - prevClose)
    );

    trueRanges.push(tr);
  }

  // 计算ATR（简单移动平均）
  const recentTR = trueRanges.slice(-period);
  const atr = recentTR.reduce((sum, tr) => sum + tr, 0) / period;

  return atr;
}

/**
 * 企稳判断
 */
export interface StabilityAnalysis {
  isStabilizing: boolean; // 是否企稳
  confidence: number; // 置信度 (0-1)
  signals: string[]; // 企稳信号描述
  volatility: number; // 当前波动率
  bollingerBands: BollingerBands | null;
  supportResistance: SupportResistanceLevels;
  atr: number | null;
}

export function analyzeStability(data: PriceData[]): StabilityAnalysis {
  const closes = data.map((d) => d.close);
  const volatility = calculateVolatility(closes);
  const bollingerBands = calculateBollingerBands(closes);
  const supportResistance = findSupportResistance(data);
  const atr = calculateATR(data);

  const signals: string[] = [];
  let score = 0;
  let maxScore = 0;

  // 1. 波动率收敛
  maxScore += 1;
  if (volatility < 0.3) {
    signals.push('波动率较低，市场相对稳定');
    score += 1;
  } else if (volatility < 0.5) {
    signals.push('波动率适中');
    score += 0.5;
  }

  // 2. 布林带收窄
  if (bollingerBands) {
    maxScore += 1;
    if (bollingerBands.bandwidth < 10) {
      signals.push('布林带收窄，波动性降低');
      score += 1;
    }

    // 3. 价格位于布林带中轨附近
    maxScore += 1;
    if (
      bollingerBands.percentB > 0.4 &&
      bollingerBands.percentB < 0.6
    ) {
      signals.push('价格位于布林带中轨附近，走势平稳');
      score += 1;
    }
  }

  // 4. 靠近支撑位
  maxScore += 1;
  if (
    supportResistance.nearestSupport &&
    supportResistance.currentPrice > supportResistance.nearestSupport
  ) {
    const distanceToSupport =
      (supportResistance.currentPrice - supportResistance.nearestSupport) /
      supportResistance.currentPrice;
    if (distanceToSupport < 0.03) {
      // 距离支撑位3%以内
      signals.push('价格接近支撑位，有支撑');
      score += 1;
    } else if (distanceToSupport < 0.05) {
      signals.push('价格靠近支撑位区域');
      score += 0.5;
    }
  }

  // 5. ATR收敛
  if (atr !== null) {
    maxScore += 1;
    const currentPrice = data[data.length - 1].close;
    const atrPercent = (atr / currentPrice) * 100;
    if (atrPercent < 2) {
      signals.push('ATR收敛，日内波动减小');
      score += 1;
    } else if (atrPercent < 3) {
      score += 0.5;
    }
  }

  const confidence = maxScore > 0 ? score / maxScore : 0;
  const isStabilizing = confidence >= 0.6;

  return {
    isStabilizing,
    confidence,
    signals,
    volatility,
    bollingerBands,
    supportResistance,
    atr,
  };
}
