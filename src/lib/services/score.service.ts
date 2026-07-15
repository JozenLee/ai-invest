// 评分服务
// 提供ETF多因子综合评分功能
// 集成真实资金流向和估值数据

import {
  calculateCapitalFlowScore,
  CapitalFlowInput,
  CapitalFlowResult,
  estimateCapitalFlowFromMacro,
} from '@/lib/indicators/capital'
import {
  calculateValuationScore,
  ValuationInput,
  ValuationResult,
  buildValuationInput,
} from '@/lib/indicators/valuation'

const DATA_SERVICE_URL = process.env.DATA_SERVICE_URL || 'http://localhost:8000'

export interface ScoreDimension {
  score: number
  weight: number
  details: string[]
}

export interface InvestmentScore {
  ticker: string
  name: string
  trackingIndex: string
  dimensions: {
    technical: ScoreDimension
    capitalFlow: ScoreDimension
    sentiment: ScoreDimension
    event: ScoreDimension
    graph: ScoreDimension
    etfQuality: ScoreDimension
    valuation: ScoreDimension
  }
  compositeScore: number
  rating: 'strong_buy' | 'buy' | 'hold' | 'reduce' | 'sell'
  confidence: number
}

export interface ScoreParams {
  ticker: string
  name: string
  trackingIndex: string
  signals?: any
  capitalFlow?: CapitalFlowInput
  events?: any[]
  graphPaths?: any[]
  etfData?: any
  valuation?: ValuationInput
  /** 是否自动获取真实数据（默认true） */
  fetchRealData?: boolean
}

export class ScoreService {
  /**
   * 计算综合评分
   */
  async calculateScore(params: ScoreParams): Promise<InvestmentScore> {
    // 自动获取真实数据
    const shouldFetch = params.fetchRealData !== false
    let capitalFlowData = params.capitalFlow
    let valuationData = params.valuation

    if (shouldFetch) {
      // 并行获取资金和估值数据
      const [capitalResult, valuationResult] = await Promise.allSettled([
        capitalFlowData ? Promise.resolve(capitalFlowData) : this.fetchCapitalFlow(params.trackingIndex),
        valuationData ? Promise.resolve(valuationData) : this.fetchValuation(params.ticker, params.trackingIndex),
      ])

      if (capitalResult.status === 'fulfilled' && capitalResult.value) {
        capitalFlowData = capitalResult.value
      }
      if (valuationResult.status === 'fulfilled' && valuationResult.value) {
        valuationData = valuationResult.value
      }
    }

    const dimensions = {
      technical: this.scoreTechnical(params.signals),
      capitalFlow: this.scoreCapitalFlow(capitalFlowData),
      sentiment: this.scoreSentiment(params.events),
      event: this.scoreEvents(params.events),
      graph: this.scoreGraph(params.graphPaths),
      etfQuality: this.scoreETFQuality(params.etfData),
      valuation: this.scoreValuation(valuationData),
    }

    // 计算加权综合评分
    const compositeScore = Object.values(dimensions).reduce(
      (sum, dim) => sum + dim.score * dim.weight,
      0
    )

    // 计算置信度
    const confidence = this.calculateConfidence(dimensions)

    // 转换为评级
    const rating = this.scoreToRating(compositeScore)

    return {
      ticker: params.ticker,
      name: params.name,
      trackingIndex: params.trackingIndex,
      dimensions,
      compositeScore: Math.round(compositeScore),
      rating,
      confidence
    }
  }

  /**
   * 从Python数据服务获取资金流向数据
   */
  private async fetchCapitalFlow(trackingIndex: string): Promise<CapitalFlowInput | undefined> {
    try {
      const response = await fetch(
        `${DATA_SERVICE_URL}/api/capital-flow/macro`,
        { signal: AbortSignal.timeout(10000) }
      )

      if (!response.ok) {
        return undefined
      }

      const result = await response.json()
      if (!result.success || !result.data) {
        return undefined
      }

      // 根据跟踪指数确定板块关键词
      const sectorKeywords = this.getTrackingIndexKeywords(trackingIndex)

      // 从宏观数据估算
      return estimateCapitalFlowFromMacro(result.data, sectorKeywords)
    } catch (error) {
      console.error('获取资金流向数据失败:', error)
      return undefined
    }
  }

  /**
   * 获取估值数据
   * 优先从Python数据服务获取，失败时使用降级数据
   */
  private async fetchValuation(ticker: string, trackingIndex: string): Promise<ValuationInput | undefined> {
    try {
      // 尝试从数据服务获取ETF估值数据
      const response = await fetch(
        `${DATA_SERVICE_URL}/api/etf/valuation?ticker=${ticker}`,
        { signal: AbortSignal.timeout(10000) }
      )

      if (response.ok) {
        const result = await response.json()
        if (result.success && result.data) {
          const data = result.data
          return {
            pe: data.pe || 0,
            pePercentile: data.pePercentile || 50,
            pb: data.pb || 0,
            pbPercentile: data.pbPercentile || 50,
            ps: data.ps,
            psPercentile: data.psPercentile,
            industryPe: data.industryPe,
            industryPb: data.industryPb,
          }
        }
      }
    } catch (error) {
      console.error('获取估值数据失败:', error)
    }

    // 降级：使用指数估值作为代理
    return this.getFallbackValuation(trackingIndex)
  }

  /**
   * 根据跟踪指数返回板块关键词
   */
  private getTrackingIndexKeywords(trackingIndex: string): string[] {
    const keywordMap: Record<string, string[]> = {
      '中证人工智能': ['AI', '人工智能', '芯片', '算力'],
      '中证半导体': ['半导体', '芯片', '集成电路'],
      '中证芯片': ['芯片', '半导体', '集成电路'],
      '国证芯片': ['芯片', '半导体'],
      '中证云计算': ['云计算', '数据中心', '服务器'],
      '中证5G通信': ['5G', '通信', '光模块'],
      '中证新能源': ['新能源', '光伏', '锂电'],
      '创业板指': ['创业板', '科技'],
      '科创50': ['科创板', '半导体', 'AI'],
      '沪深300': ['大盘', '蓝筹'],
      '中证500': ['中盘'],
      '中证1000': ['小盘'],
    }

    // 模糊匹配
    for (const [key, keywords] of Object.entries(keywordMap)) {
      if (trackingIndex.includes(key) || key.includes(trackingIndex)) {
        return keywords
      }
    }

    return []
  }

  /**
   * 降级估值数据
   * 使用各指数的历史估值中位数
   */
  private getFallbackValuation(trackingIndex: string): ValuationInput | undefined {
    // 各指数估值参考数据（基于历史中位数）
    const fallbackData: Record<string, { pe: number; pePct: number; pb: number; pbPct: number }> = {
      '中证人工智能': { pe: 45, pePct: 35, pb: 4.5, pbPct: 40 },
      '中证半导体': { pe: 55, pePct: 40, pb: 5.0, pbPct: 45 },
      '中证芯片': { pe: 60, pePct: 38, pb: 5.5, pbPct: 42 },
      '国证芯片': { pe: 50, pePct: 42, pb: 4.8, pbPct: 40 },
      '中证云计算': { pe: 40, pePct: 30, pb: 3.5, pbPct: 35 },
      '创业板指': { pe: 35, pePct: 25, pb: 4.0, pbPct: 30 },
      '科创50': { pe: 45, pePct: 30, pb: 4.2, pbPct: 35 },
      '沪深300': { pe: 12, pePct: 45, pb: 1.4, pbPct: 50 },
      '中证500': { pe: 25, pePct: 40, pb: 1.8, pbPct: 45 },
    }

    // 模糊匹配
    for (const [key, data] of Object.entries(fallbackData)) {
      if (trackingIndex.includes(key) || key.includes(trackingIndex)) {
        return buildValuationInput(data.pe, data.pb, data.pePct, data.pbPct)
      }
    }

    // 无匹配时返回行业平均估值
    return buildValuationInput(30, 3.0, 50, 50)
  }

  /**
   * 技术面评分 (15%)
   */
  private scoreTechnical(signals?: any): ScoreDimension {
    const details: string[] = []
    let score = 50 // 基准分

    if (!signals) {
      return { score, weight: 0.15, details: ['无技术面数据'] }
    }

    // 趋势信号
    if (signals.trend) {
      if (signals.trend.direction === 'bullish') {
        score += 15
        details.push('趋势看多')
      } else if (signals.trend.direction === 'bearish') {
        score -= 15
        details.push('趋势看空')
      }
    }

    // 动量信号
    if (signals.momentum) {
      if (signals.momentum.oversold) {
        score += 10
        details.push('RSI超卖，可能反弹')
      } else if (signals.momentum.overbought) {
        score -= 10
        details.push('RSI超买，注意回调')
      }
    }

    // 量能信号
    if (signals.volume) {
      if (signals.volume.trendConfirm) {
        score += 10
        details.push('量价配合')
      }
    }

    return {
      score: Math.max(0, Math.min(100, score)),
      weight: 0.15,
      details
    }
  }

  /**
   * 资金面评分 (20%)
   * 使用真实的 calculateCapitalFlowScore 计算
   */
  private scoreCapitalFlow(capitalFlow?: CapitalFlowInput): ScoreDimension {
    const details: string[] = []

    if (!capitalFlow) {
      return { score: 50, weight: 0.20, details: ['无资金面数据'] }
    }

    // 使用资金流向评分模块计算
    const result: CapitalFlowResult = calculateCapitalFlowScore(capitalFlow)

    // 将 -100~100 的评分映射到 0~100
    const score = (result.score + 100) / 2

    // 添加资金共振信号
    if (result.resonance) {
      details.push(
        result.mainForceDirection === 'inflow'
          ? '主力与北向资金共振流入'
          : '主力与北向资金共振流出'
      )
    }

    // 添加关键详情
    details.push(...result.details.slice(0, 3))

    return {
      score: Math.max(0, Math.min(100, score)),
      weight: 0.20,
      details
    }
  }

  /**
   * 情绪面评分 (10%)
   */
  private scoreSentiment(events?: any[]): ScoreDimension {
    const details: string[] = []
    let score = 50

    if (!events || events.length === 0) {
      return { score, weight: 0.10, details: ['无事件数据'] }
    }

    // 计算平均情感
    const sentiments = events.filter(e => e.sentiment !== undefined).map(e => e.sentiment)
    if (sentiments.length > 0) {
      const avgSentiment = sentiments.reduce((a, b) => a + b, 0) / sentiments.length
      score += avgSentiment * 30

      if (avgSentiment > 0.3) {
        details.push('市场情绪偏乐观')
      } else if (avgSentiment < -0.3) {
        details.push('市场情绪偏悲观')
      } else {
        details.push('市场情绪中性')
      }
    }

    return {
      score: Math.max(0, Math.min(100, score)),
      weight: 0.10,
      details
    }
  }

  /**
   * 事件驱动评分 (15%)
   */
  private scoreEvents(events?: any[]): ScoreDimension {
    const details: string[] = []
    let score = 50

    if (!events || events.length === 0) {
      return { score, weight: 0.15, details: ['无事件数据'] }
    }

    // 统计利好/利空事件
    const bullish = events.filter(e => (e.sentiment || 0) > 0.2).length
    const bearish = events.filter(e => (e.sentiment || 0) < -0.2).length

    if (bullish > bearish) {
      score += 15
      details.push(`利好事件${bullish}条，利空${bearish}条`)
    } else if (bearish > bullish) {
      score -= 15
      details.push(`利空事件${bearish}条，利好${bullish}条`)
    } else {
      details.push('利好利空事件持平')
    }

    // 高影响力事件
    const highImpact = events.filter(e => (e.impact || 0) >= 4).length
    if (highImpact > 0) {
      details.push(`${highImpact}条高影响力事件`)
    }

    return {
      score: Math.max(0, Math.min(100, score)),
      weight: 0.15,
      details
    }
  }

  /**
   * 产业链评分 (15%)
   */
  private scoreGraph(graphPaths?: any[]): ScoreDimension {
    const details: string[] = []
    let score = 50

    if (!graphPaths || graphPaths.length === 0) {
      return { score, weight: 0.15, details: ['无传导路径数据'] }
    }

    // 传导路径数量
    if (graphPaths.length >= 3) {
      score += 15
      details.push(`${graphPaths.length}条传导路径`)
    } else if (graphPaths.length >= 1) {
      score += 5
      details.push(`${graphPaths.length}条传导路径`)
    }

    // 平均置信度
    const confidences = graphPaths.map(p => p.finalImpact?.confidence || 0.5)
    const avgConfidence = confidences.reduce((a, b) => a + b, 0) / confidences.length
    if (avgConfidence > 0.8) {
      score += 10
      details.push('传导置信度高')
    }

    return {
      score: Math.max(0, Math.min(100, score)),
      weight: 0.15,
      details
    }
  }

  /**
   * ETF质量评分 (15%)
   */
  private scoreETFQuality(etfData?: any): ScoreDimension {
    const details: string[] = []
    let score = 50

    if (!etfData) {
      return { score, weight: 0.15, details: ['无ETF数据'] }
    }

    // 规模
    if (etfData.totalAssets > 100) {
      score += 10
      details.push('规模较大')
    } else if (etfData.totalAssets < 10) {
      score -= 10
      details.push('规模较小')
    }

    // 跟踪误差
    if (etfData.trackingError && etfData.trackingError < 0.1) {
      score += 10
      details.push('跟踪误差小')
    }

    // 流动性
    if (etfData.volume && etfData.volume > 100000000) {
      score += 10
      details.push('流动性好')
    }

    return {
      score: Math.max(0, Math.min(100, score)),
      weight: 0.15,
      details
    }
  }

  /**
   * 估值评分 (10%)
   * 使用真实的 calculateValuationScore 计算
   */
  private scoreValuation(valuationInput?: ValuationInput): ScoreDimension {
    const details: string[] = []

    if (!valuationInput) {
      return { score: 50, weight: 0.10, details: ['无估值数据'] }
    }

    // 使用估值评分模块计算
    const result: ValuationResult = calculateValuationScore(valuationInput)

    // 将 -100~100 的评分映射到 0~100
    const score = (result.score + 100) / 2

    // 添加评级信息
    if (result.rating === 'undervalued') {
      details.push('综合估值偏低')
    } else if (result.rating === 'overvalued') {
      details.push('综合估值偏高')
    } else {
      details.push('综合估值合理')
    }

    // 添加关键估值指标
    details.push(`PE百分位${valuationInput.pePercentile.toFixed(1)}%`)
    details.push(`PB百分位${valuationInput.pbPercentile.toFixed(1)}%`)

    return {
      score: Math.max(0, Math.min(100, score)),
      weight: 0.10,
      details
    }
  }

  /**
   * 计算置信度
   */
  private calculateConfidence(dimensions: Record<string, ScoreDimension>): number {
    const detailsCount = Object.values(dimensions).reduce((sum, d) => sum + d.details.length, 0)

    // 数据完整性影响置信度
    const completeness = Math.min(1, detailsCount / 10)

    // 检查是否有缺失数据维度
    const hasMissing = Object.values(dimensions).some(
      d => d.details.some(detail => detail.includes('无') && detail.includes('数据'))
    )

    const missingPenalty = hasMissing ? 0.15 : 0

    return Math.round(Math.max(0, completeness - missingPenalty) * 100) / 100
  }

  /**
   * 评分转评级
   */
  private scoreToRating(score: number): InvestmentScore['rating'] {
    if (score >= 80) return 'strong_buy'
    if (score >= 65) return 'buy'
    if (score >= 45) return 'hold'
    if (score >= 30) return 'reduce'
    return 'sell'
  }
}

// 全局单例
export const scoreService = new ScoreService()
