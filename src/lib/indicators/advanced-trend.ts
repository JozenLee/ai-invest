/**
 * Advanced Trend Indicators - 高级趋势分析
 * 包括趋势强度、趋势转折点识别、多时间周期趋势分析等
 */

interface PriceData {
  close: number;
  high: number;
  low: number;
  volume?: number;
  timestamp?: string;
}

/**
 * ADX (Average Directional Index) - 平均趋向指标
 */
export interface ADXResult {
  adx: number; // ADX值
  plusDI: number; // +DI
  minusDI: number; // -DI
  trendStrength: 'weak' | 'moderate' | 'strong' | 'very_strong';
  trendDirection: 'bullish' | 'bearish' | 'neutral';
}

export function calculateADX(
  data: PriceData[],
  period: number = 14
): ADXResult | null {
  if (data.length < period * 2) return null;

  // 计算True Range和方向性移动
  const trueRanges: number[] = [];
  const plusDM: number[] = [];
  const minusDM: number[] = [];

  for (let i = 1; i < data.length; i++) {
    const high = data[i].high;
    const low = data[i].low;
    const prevHigh = data[i - 1].high;
    const prevLow = data[i - 1].low;
    const prevClose = data[i - 1].close;

    // True Range
    const tr = Math.max(
      high - low,
      Math.abs(high - prevClose),
      Math.abs(low - prevClose)
    );
    trueRanges.push(tr);

    // Directional Movement
    const upMove = high - prevHigh;
    const downMove = prevLow - low;

    plusDM.push(upMove > downMove && upMove > 0 ? upMove : 0);
    minusDM.push(downMove > upMove && downMove > 0 ? downMove : 0);
  }

  // 计算平滑的ATR、+DM、-DM
  const smoothTR = calculateEMA(trueRanges, period);
  const smoothPlusDM = calculateEMA(plusDM, period);
  const smoothMinusDM = calculateEMA(minusDM, period);

  if (smoothTR.length === 0) return null;

  // 计算+DI和-DI
  const plusDI = (smoothPlusDM[smoothPlusDM.length - 1] / smoothTR[smoothTR.length - 1]) * 100;
  const minusDI = (smoothMinusDM[smoothMinusDM.length - 1] / smoothTR[smoothTR.length - 1]) * 100;

  // 计算DX
  const dx: number[] = [];
  for (let i = 0; i < Math.min(smoothPlusDM.length, smoothMinusDM.length, smoothTR.length); i++) {
    const pdi = (smoothPlusDM[i] / smoothTR[i]) * 100;
    const mdi = (smoothMinusDM[i] / smoothTR[i]) * 100;
    const dxValue = Math.abs(pdi - mdi) / (pdi + mdi) * 100;
    dx.push(dxValue);
  }

  // 计算ADX (DX的移动平均)
  const adxValues = calculateEMA(dx, period);
  const adx = adxValues[adxValues.length - 1];

  // 判断趋势强度
  let trendStrength: 'weak' | 'moderate' | 'strong' | 'very_strong';
  if (adx < 20) trendStrength = 'weak';
  else if (adx < 40) trendStrength = 'moderate';
  else if (adx < 60) trendStrength = 'strong';
  else trendStrength = 'very_strong';

  // 判断趋势方向
  let trendDirection: 'bullish' | 'bearish' | 'neutral';
  if (plusDI > minusDI && adx > 20) trendDirection = 'bullish';
  else if (minusDI > plusDI && adx > 20) trendDirection = 'bearish';
  else trendDirection = 'neutral';

  return {
    adx,
    plusDI,
    minusDI,
    trendStrength,
    trendDirection,
  };
}

/**
 * 计算EMA辅助函数
 */
function calculateEMA(values: number[], period: number): number[] {
  if (values.length < period) return [];

  const multiplier = 2 / (period + 1);
  const ema: number[] = [];

  // 第一个EMA值使用SMA
  let sum = 0;
  for (let i = 0; i < period; i++) {
    sum += values[i];
  }
  ema.push(sum / period);

  // 后续使用EMA公式
  for (let i = period; i < values.length; i++) {
    const emaValue = (values[i] - ema[ema.length - 1]) * multiplier + ema[ema.length - 1];
    ema.push(emaValue);
  }

  return ema;
}

/**
 * 趋势转折点识别
 */
export interface TrendReversalSignal {
  type: 'bullish_reversal' | 'bearish_reversal' | 'continuation';
  confidence: number; // 0-1
  signals: string[];
  timestamp?: string;
}

export function detectTrendReversal(
  data: PriceData[],
  lookbackPeriod: number = 30
): TrendReversalSignal {
  if (data.length < lookbackPeriod) {
    return {
      type: 'continuation',
      confidence: 0,
      signals: ['数据不足'],
    };
  }

  const recentData = data.slice(-lookbackPeriod);
  const signals: string[] = [];
  let bullishScore = 0;
  let bearishScore = 0;
  let maxScore = 0;

  // 1. 背离检测
  const divergence = detectDivergence(recentData);
  maxScore += 2;
  if (divergence === 'bullish') {
    signals.push('检测到看涨背离');
    bullishScore += 2;
  } else if (divergence === 'bearish') {
    signals.push('检测到看跌背离');
    bearishScore += 2;
  }

  // 2. 双底/双顶形态
  const pattern = detectDoublePattern(recentData);
  maxScore += 2;
  if (pattern === 'double_bottom') {
    signals.push('形成双底形态');
    bullishScore += 2;
  } else if (pattern === 'double_top') {
    signals.push('形成双顶形态');
    bearishScore += 2;
  }

  // 3. 移动平均线交叉
  const maCross = detectMACross(recentData);
  maxScore += 1;
  if (maCross === 'golden_cross') {
    signals.push('黄金交叉 (短期均线上穿长期均线)');
    bullishScore += 1;
  } else if (maCross === 'death_cross') {
    signals.push('死亡交叉 (短期均线下穿长期均线)');
    bearishScore += 1;
  }

  // 4. 成交量分析
  const volumeSignal = analyzeVolume(recentData);
  maxScore += 1;
  if (volumeSignal === 'bullish') {
    signals.push('成交量放大配合上涨');
    bullishScore += 1;
  } else if (volumeSignal === 'bearish') {
    signals.push('成交量放大配合下跌');
    bearishScore += 1;
  }

  // 判断类型和置信度
  let type: 'bullish_reversal' | 'bearish_reversal' | 'continuation';
  let confidence: number;

  if (bullishScore > bearishScore && bullishScore >= 2) {
    type = 'bullish_reversal';
    confidence = bullishScore / maxScore;
  } else if (bearishScore > bullishScore && bearishScore >= 2) {
    type = 'bearish_reversal';
    confidence = bearishScore / maxScore;
  } else {
    type = 'continuation';
    confidence = 0;
    if (signals.length === 0) {
      signals.push('未检测到明显转折信号');
    }
  }

  return {
    type,
    confidence,
    signals,
    timestamp: recentData[recentData.length - 1].timestamp,
  };
}

/**
 * 背离检测
 */
function detectDivergence(data: PriceData[]): 'bullish' | 'bearish' | null {
  if (data.length < 20) return null;

  // 简化的RSI计算
  const closes = data.map((d) => d.close);
  const rsi = calculateSimpleRSI(closes, 14);
  if (rsi.length < 10) return null;

  // 找价格低点和高点
  const recentPrices = closes.slice(-10);
  const recentRSI = rsi.slice(-10);

  const priceLowest = Math.min(...recentPrices);
  const priceHighest = Math.max(...recentPrices);

  const rsiAtPriceLow = recentRSI[recentPrices.indexOf(priceLowest)];
  const rsiAtPriceHigh = recentRSI[recentPrices.indexOf(priceHighest)];

  // 看涨背离：价格新低但RSI未创新低
  if (priceLowest === recentPrices[recentPrices.length - 1]) {
    const prevLows = recentPrices.slice(0, -1);
    if (prevLows.some((p) => p <= priceLowest * 1.02)) {
      const prevRSI = recentRSI[prevLows.indexOf(Math.min(...prevLows))];
      if (rsiAtPriceLow > prevRSI) {
        return 'bullish';
      }
    }
  }

  // 看跌背离：价格新高但RSI未创新高
  if (priceHighest === recentPrices[recentPrices.length - 1]) {
    const prevHighs = recentPrices.slice(0, -1);
    if (prevHighs.some((p) => p >= priceHighest * 0.98)) {
      const prevRSI = recentRSI[prevHighs.indexOf(Math.max(...prevHighs))];
      if (rsiAtPriceHigh < prevRSI) {
        return 'bearish';
      }
    }
  }

  return null;
}

function calculateSimpleRSI(prices: number[], period: number): number[] {
  const rsi: number[] = [];
  if (prices.length < period + 1) return rsi;

  for (let i = period; i < prices.length; i++) {
    let gains = 0;
    let losses = 0;

    for (let j = i - period + 1; j <= i; j++) {
      const change = prices[j] - prices[j - 1];
      if (change > 0) gains += change;
      else losses += Math.abs(change);
    }

    const avgGain = gains / period;
    const avgLoss = losses / period;
    const rs = avgLoss === 0 ? 100 : avgGain / avgLoss;
    rsi.push(100 - 100 / (1 + rs));
  }

  return rsi;
}

/**
 * 双底/双顶检测
 */
function detectDoublePattern(data: PriceData[]): 'double_bottom' | 'double_top' | null {
  if (data.length < 20) return null;

  const lows = data.map((d) => d.low);
  const highs = data.map((d) => d.high);

  // 查找两个相近的低点 (双底)
  for (let i = 5; i < lows.length - 5; i++) {
    const firstLow = lows[i];
    for (let j = i + 5; j < lows.length; j++) {
      const secondLow = lows[j];
      if (Math.abs(firstLow - secondLow) / firstLow < 0.02) {
        // 2%容差
        // 检查中间是否有反弹
        const middle = lows.slice(i, j);
        if (Math.max(...middle) > firstLow * 1.05) {
          return 'double_bottom';
        }
      }
    }
  }

  // 查找两个相近的高点 (双顶)
  for (let i = 5; i < highs.length - 5; i++) {
    const firstHigh = highs[i];
    for (let j = i + 5; j < highs.length; j++) {
      const secondHigh = highs[j];
      if (Math.abs(firstHigh - secondHigh) / firstHigh < 0.02) {
        const middle = highs.slice(i, j);
        if (Math.min(...middle) < firstHigh * 0.95) {
          return 'double_top';
        }
      }
    }
  }

  return null;
}

/**
 * 均线交叉检测
 */
function detectMACross(data: PriceData[]): 'golden_cross' | 'death_cross' | null {
  if (data.length < 50) return null;

  const closes = data.map((d) => d.close);

  // 计算短期和长期均线
  const shortMA = calculateSMA(closes.slice(-20), 20);
  const longMA = calculateSMA(closes.slice(-50), 50);

  const prevShortMA = calculateSMA(closes.slice(-21, -1), 20);
  const prevLongMA = calculateSMA(closes.slice(-51, -1), 50);

  // 黄金交叉
  if (prevShortMA < prevLongMA && shortMA > longMA) {
    return 'golden_cross';
  }

  // 死亡交叉
  if (prevShortMA > prevLongMA && shortMA < longMA) {
    return 'death_cross';
  }

  return null;
}

function calculateSMA(values: number[], period: number): number {
  if (values.length < period) return 0;
  const sum = values.slice(-period).reduce((a, b) => a + b, 0);
  return sum / period;
}

/**
 * 成交量分析
 */
function analyzeVolume(data: PriceData[]): 'bullish' | 'bearish' | null {
  if (data.length < 10) return null;

  const recentData = data.slice(-5);
  const prevData = data.slice(-10, -5);

  const recentAvgVolume =
    recentData.reduce((sum, d) => sum + (d.volume || 0), 0) / recentData.length;
  const prevAvgVolume =
    prevData.reduce((sum, d) => sum + (d.volume || 0), 0) / prevData.length;

  const volumeIncrease = recentAvgVolume > prevAvgVolume * 1.2;

  if (!volumeIncrease) return null;

  // 价格趋势
  const priceChange =
    (recentData[recentData.length - 1].close - recentData[0].close) /
    recentData[0].close;

  if (priceChange > 0.03) return 'bullish';
  if (priceChange < -0.03) return 'bearish';

  return null;
}

/**
 * 趋势综合分析
 */
export interface TrendAnalysis {
  adx: ADXResult | null;
  reversal: TrendReversalSignal;
  summary: string;
  actionSuggestion: 'buy' | 'sell' | 'hold' | 'wait';
}

export function analyzeTrend(data: PriceData[]): TrendAnalysis {
  const adx = calculateADX(data);
  const reversal = detectTrendReversal(data);

  let summary = '';
  let actionSuggestion: 'buy' | 'sell' | 'hold' | 'wait' = 'wait';

  if (adx) {
    summary += `当前趋势强度: ${adx.trendStrength} (ADX: ${adx.adx.toFixed(2)})\n`;
    summary += `趋势方向: ${adx.trendDirection === 'bullish' ? '看涨' : adx.trendDirection === 'bearish' ? '看跌' : '中性'}\n`;
  }

  if (reversal.confidence > 0.5) {
    summary += `\n检测到${reversal.type === 'bullish_reversal' ? '看涨' : '看跌'}转折信号 (置信度: ${(reversal.confidence * 100).toFixed(0)}%)\n`;
    summary += reversal.signals.join('\n');
  }

  // 操作建议
  if (reversal.type === 'bullish_reversal' && reversal.confidence > 0.6) {
    actionSuggestion = 'buy';
  } else if (reversal.type === 'bearish_reversal' && reversal.confidence > 0.6) {
    actionSuggestion = 'sell';
  } else if (adx && adx.trendStrength !== 'weak') {
    actionSuggestion = 'hold';
  }

  return {
    adx,
    reversal,
    summary: summary || '趋势不明朗，建议观望',
    actionSuggestion,
  };
}
