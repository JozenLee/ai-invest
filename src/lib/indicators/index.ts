// 技术指标计算引擎统一导出
// 四维度信号：趋势 + 动量 + 成交量 + 资金流向
// 综合评分权重：趋势30% + 动量25% + 成交量20% + 资金25%

export * from './trend'
export * from './momentum'
export * from './volume'
export * from './capital'
export * from './valuation'

import { calculateMA, calculateMACD, calculateDMI, calculateBOLL, calculateSAR, isMABullish, isMABearish, MAResult, BOLLResult, SARResult } from './trend'
import { calculateRSI, calculateKDJ, calculateCCI, calculateWR, isRSIOverbought, isRSIOversold } from './momentum'
import { calculateOBV, calculateVWAP, calculateVolumeRatio, isVolumeAbnormal } from './volume'
import { calculateCapitalFlowScore, CapitalFlowInput, CapitalFlowResult } from './capital'
import { calculateValuationScore, ValuationInput, ValuationResult } from './valuation'

export interface DailyData {
  date: string
  open: number
  high: number
  low: number
  close: number
  volume: number
  amount?: number
}

export interface IndicatorResult {
  trend: {
    ma: { [key: string]: number }
    macd: { dif: number; dea: number; macd: number }
    dmi: { pdi: number; mdi: number; adx: number; adxr: number }
    boll: BOLLResult
    sar: SARResult
  }
  momentum: {
    rsi: { rsi6: number; rsi12: number; rsi24: number }
    kdj: { k: number; d: number; j: number }
    cci: number
    wr: number
  }
  volume: {
    obv: number
    vwap: number
    volumeRatio: number
  }
}

export interface SignalOutput {
  ticker: string
  timestamp: string
  signals: {
    trend: {
      score: number
      direction: 'bullish' | 'bearish' | 'neutral'
      strength: number
      details: string[]
    }
    momentum: {
      score: number
      overbought: boolean
      oversold: boolean
      details: string[]
    }
    volume: {
      score: number
      abnormal: boolean
      trendConfirm: boolean
      details: string[]
    }
    capital: CapitalFlowResult
    valuation: ValuationResult
  }
  compositeScore: number
}

/**
 * 计算所有技术指标
 */
export function calculateAllIndicators(data: DailyData[]): IndicatorResult {
  const closes = data.map(d => d.close)
  const highs = data.map(d => d.high)
  const lows = data.map(d => d.low)
  const volumes = data.map(d => d.volume)

  return {
    trend: {
      ma: calculateMA(closes, [5, 10, 20, 60]),
      macd: calculateMACD(closes),
      dmi: calculateDMI(highs, lows, closes),
      boll: calculateBOLL(closes),
      sar: calculateSAR(highs, lows, closes),
    },
    momentum: {
      rsi: calculateRSI(closes),
      kdj: calculateKDJ(highs, lows, closes),
      cci: calculateCCI(highs, lows, closes),
      wr: calculateWR(highs, lows, closes),
    },
    volume: {
      obv: calculateOBV(closes, volumes),
      vwap: calculateVWAP(highs, lows, closes, volumes),
      volumeRatio: calculateVolumeRatio(volumes),
    },
  }
}

/**
 * 生成多维度信号（含资金和估值维度）
 *
 * 综合评分权重：
 * - 趋势: 30%
 * - 动量: 25%
 * - 成交量: 20%
 * - 资金流向: 25%
 *
 * @param ticker 标的代码
 * @param indicators 技术指标结果
 * @param capitalFlow 资金流向数据（可选）
 * @param valuation 估值数据（可选）
 */
export function generateSignals(
  ticker: string,
  indicators: IndicatorResult,
  capitalFlow?: CapitalFlowInput,
  valuation?: ValuationInput
): SignalOutput {
  const trendDetails: string[] = []
  let trendScore = 0

  // 趋势信号评分
  const ma = indicators.trend.ma as unknown as MAResult
  if (isMABullish(ma)) {
    trendScore += 20
    trendDetails.push('MA多头排列')
  } else if (isMABearish(ma)) {
    trendScore -= 20
    trendDetails.push('MA空头排列')
  }

  if (indicators.trend.macd.macd > 0) {
    trendScore += 10
    trendDetails.push('MACD金叉')
  } else {
    trendScore -= 10
    trendDetails.push('MACD死叉')
  }

  if (indicators.trend.dmi.adx > 25) {
    if (indicators.trend.dmi.pdi > indicators.trend.dmi.mdi) {
      trendScore += 15
      trendDetails.push('DMI强势')
    } else {
      trendScore -= 15
      trendDetails.push('DMI弱势')
    }
  }

  // BOLL信号
  const boll = indicators.trend.boll
  if (boll.percentB > 0.8) {
    trendScore += 5
    trendDetails.push('BOLL上轨附近')
  } else if (boll.percentB < 0.2) {
    trendScore -= 5
    trendDetails.push('BOLL下轨附近')
  }

  // SAR信号
  const sar = indicators.trend.sar
  if (sar.isLong) {
    trendScore += 10
    trendDetails.push('SAR多头')
  } else {
    trendScore -= 10
    trendDetails.push('SAR空头')
  }

  const trendDirection = trendScore > 10 ? 'bullish' : trendScore < -10 ? 'bearish' : 'neutral'

  // 动量信号评分
  const momentumDetails: string[] = []
  let momentumScore = 0

  const rsi = indicators.momentum.rsi.rsi12
  if (isRSIOverbought(rsi)) {
    momentumScore -= 15
    momentumDetails.push('RSI超买')
  } else if (isRSIOversold(rsi)) {
    momentumScore += 15
    momentumDetails.push('RSI超卖')
  }

  if (indicators.momentum.kdj.k < 20 && indicators.momentum.kdj.k > indicators.momentum.kdj.d) {
    momentumScore += 15
    momentumDetails.push('KDJ低位金叉')
  }

  if (indicators.momentum.cci > 100) {
    momentumScore += 10
    momentumDetails.push('CCI强势')
  } else if (indicators.momentum.cci < -100) {
    momentumScore -= 10
    momentumDetails.push('CCI弱势')
  }

  // 量能信号评分
  const volumeDetails: string[] = []
  let volumeScore = 50 // 基准分50

  const volumeRatio = indicators.volume.volumeRatio
  const obv = indicators.volume.obv

  // 量比评分 (权重60%)
  if (volumeRatio > 2.0) {
    volumeScore += 20
    volumeDetails.push('异常放量')
  } else if (volumeRatio > 1.5) {
    volumeScore += 10
    volumeDetails.push('温和放量')
  } else if (volumeRatio < 0.5) {
    volumeScore -= 20
    volumeDetails.push('异常缩量')
  } else if (volumeRatio < 0.7) {
    volumeScore -= 10
    volumeDetails.push('温和缩量')
  }

  // OBV趋势评分 (权重40%)
  if (obv > 0) {
    volumeScore += 10
    volumeDetails.push('OBV为正')
  } else if (obv < 0) {
    volumeScore -= 10
    volumeDetails.push('OBV为负')
  }

  // 资金流向信号评分
  const capitalResult = capitalFlow
    ? calculateCapitalFlowScore(capitalFlow)
    : {
        score: 0,
        mainForceScore: 0,
        northboundScore: 0,
        marginScore: 0,
        mainForceDirection: 'neutral' as const,
        northboundDirection: 'neutral' as const,
        resonance: false,
        details: ['无资金流向数据'],
      }

  // 估值信号评分
  const valuationResult = valuation
    ? calculateValuationScore(valuation)
    : {
        score: 0,
        peScore: 0,
        pbScore: 0,
        rating: 'fair' as const,
        details: ['无估值数据'],
      }

  // 综合评分：趋势30% + 动量25% + 成交量20% + 资金25%
  const compositeScore = (
    trendScore * 0.30 +
    momentumScore * 0.25 +
    volumeScore * 0.20 +
    // 资金评分范围是 -100~100，需要归一化到和其他维度相近的范围
    (capitalResult.score + 100) / 2 * 0.25
  )

  return {
    ticker,
    timestamp: new Date().toISOString(),
    signals: {
      trend: {
        score: trendScore,
        direction: trendDirection,
        strength: Math.abs(trendScore) / 50,
        details: trendDetails,
      },
      momentum: {
        score: momentumScore,
        overbought: isRSIOverbought(rsi),
        oversold: isRSIOversold(rsi),
        details: momentumDetails,
      },
      volume: {
        score: volumeScore,
        abnormal: isVolumeAbnormal(volumeRatio),
        trendConfirm: false,
        details: volumeDetails,
      },
      capital: capitalResult,
      valuation: valuationResult,
    },
    compositeScore: compositeScore,
  }
}
