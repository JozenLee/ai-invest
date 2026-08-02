// AI算力硬件领域投资参考规则配置
// 定义各种市场情况下的投资信号和建议

export interface InvestmentSignal {
  id: string
  name: string
  description: string
  conditions: SignalCondition[]
  recommendations: string[]
  riskLevel: 'low' | 'medium' | 'high'
  relatedETFs: string[]
  confidence: number  // 0-1
}

export interface SignalCondition {
  metric: string
  operator: '>' | '<' | '=' | '>=' | '<=' | 'contains'
  value: number | string | boolean
  weight: number  // 权重，用于计算信号强度
}

// AI算力硬件投资信号配置
export const AI_COMPUTE_INVESTMENT_SIGNALS: InvestmentSignal[] = [
  // ========== 上游芯片设计机会 ==========
  {
    id: 'gpu_shortage_opportunity',
    name: 'GPU供应紧张 - 上游受益',
    description: 'GPU供应紧张度高，NVIDIA产品周期在发布期或成熟期，利好芯片设计和代工企业',
    conditions: [
      { metric: 'gpuSupplyTightness', operator: '>', value: 70, weight: 0.4 },
      { metric: 'nvidiaCycle', operator: '=', value: 'launch', weight: 0.3 },
      { metric: 'mainForceNet5d', operator: '>', value: 0, weight: 0.2 },
      { metric: 'sentimentLabel', operator: '=', value: 'bullish', weight: 0.1 },
    ],
    recommendations: [
      '关注芯片设计节点（AI芯片、GPU芯片）',
      '关注晶圆代工节点（台积电、中芯国际供应链）',
      '关注封装测试节点（CoWoS、2.5D/3D封装）',
    ],
    riskLevel: 'medium',
    relatedETFs: ['512480', '159995'], // 半导体ETF、芯片ETF
    confidence: 0.8,
  },

  // ========== HBM存储机会 ==========
  {
    id: 'hbm_tight_opportunity',
    name: 'HBM供应紧张 - 存储芯片受益',
    description: 'HBM供应紧张，AI服务器需求强劲，利好存储芯片厂商',
    conditions: [
      { metric: 'hbmSupplyStatus', operator: '=', value: 'tight', weight: 0.5 },
      { metric: 'hyperscalerDemand', operator: '=', value: 'strong', weight: 0.3 },
      { metric: 'newsCount7d', operator: '>', value: 10, weight: 0.2 },
    ],
    recommendations: [
      '关注存储节点（HBM、GDDR6供应商）',
      '关注相关A股标的（如存储产业链上市公司）',
      '注意：HBM主要供应商在韩国（SK海力士）和美国（美光），A股标的有限',
    ],
    riskLevel: 'medium',
    relatedETFs: ['512480', '159995'],
    confidence: 0.75,
  },

  // ========== 数据中心建设周期 ==========
  {
    id: 'datacenter_capex_cycle',
    name: '数据中心建设周期 - 全产业链受益',
    description: '云厂商资本开支增加，数据中心建设加速，利好服务器、散热、光模块等',
    conditions: [
      { metric: 'hyperscalerDemand', operator: '=', value: 'strong', weight: 0.3 },
      { metric: 'newsCount7d', operator: '>', value: 15, weight: 0.2 },
      { metric: 'mainForceNet5d', operator: '>', value: 50000, weight: 0.3 },
      { metric: 'sentiment', operator: '>', value: 30, weight: 0.2 },
    ],
    recommendations: [
      '一级受益：服务器节点（AI服务器厂商）',
      '二级受益：散热节点（液冷技术）、电源节点（高功率电源）',
      '三级受益：光模块节点（800G光模块）、PCB节点（高速板）',
    ],
    riskLevel: 'low',
    relatedETFs: ['515070'], // AI ETF
    confidence: 0.85,
  },

  // ========== 液冷技术突破 ==========
  {
    id: 'liquid_cooling_breakthrough',
    name: '液冷技术突破 - 散热产业链机会',
    description: '液冷技术获得突破，高功耗GPU需求推动液冷方案普及',
    conditions: [
      { metric: 'newsCount7d', operator: '>', value: 20, weight: 0.3 },
      { metric: 'topKeywords', operator: 'contains', value: '液冷', weight: 0.3 },
      { metric: 'sentimentScore', operator: '>', value: 0.4, weight: 0.2 },
      { metric: 'trending', operator: '=', value: true, weight: 0.2 },
    ],
    recommendations: [
      '关注散热节点（液冷解决方案提供商）',
      '关注服务器节点（支持液冷的AI服务器）',
      '警惕：新技术炒作可能导致短期过热，建议分批布局',
    ],
    riskLevel: 'high',
    relatedETFs: ['515070'],
    confidence: 0.65,
  },

  // ========== CPO光模块革新 ==========
  {
    id: 'cpo_technology_adoption',
    name: 'CPO技术落地 - 光通信产业链机会',
    description: 'CPO（共封装光学）技术开始量产，利好光通信产业链',
    conditions: [
      { metric: 'topKeywords', operator: 'contains', value: 'CPO', weight: 0.3 },
      { metric: 'newsCount7d', operator: '>', value: 15, weight: 0.2 },
      { metric: 'sentimentLabel', operator: '=', value: 'bullish', weight: 0.2 },
      { metric: 'institutionalAttention', operator: '>', value: 60, weight: 0.3 },
    ],
    recommendations: [
      '关注光模块节点（800G光模块厂商）',
      '关注CPO节点（CPO技术领先企业）',
      '关注光通信节点（光芯片、激光器）',
    ],
    riskLevel: 'medium',
    relatedETFs: ['515880'], // 通信ETF
    confidence: 0.7,
  },

  // ========== 资金流出预警 ==========
  {
    id: 'capital_outflow_warning',
    name: '主力资金流出 - 警惕风险',
    description: '主力资金持续流出，市场情绪转弱，建议减仓或观望',
    conditions: [
      { metric: 'mainForceNet5d', operator: '<', value: -50000, weight: 0.4 },
      { metric: 'consecutiveDays', operator: '<', value: -3, weight: 0.3 },
      { metric: 'sentiment', operator: '<', value: -30, weight: 0.3 },
    ],
    recommendations: [
      '主力资金持续流出，建议降低仓位',
      '等待企稳信号（资金回流、情绪回暖）',
      '可关注其他热点板块',
    ],
    riskLevel: 'high',
    relatedETFs: [],
    confidence: 0.8,
  },

  // ========== 情绪过热警告 ==========
  {
    id: 'sentiment_overheating',
    name: '市场情绪过热 - 警惕回调',
    description: '散户关注度过高，ETF溢价率高，可能面临回调风险',
    conditions: [
      { metric: 'retailAttention', operator: '>', value: 80, weight: 0.3 },
      { metric: 'premium', operator: '>', value: 3, weight: 0.3 },
      { metric: 'changePct5d', operator: '>', value: 15, weight: 0.2 },
      { metric: 'sentiment', operator: '>', value: 70, weight: 0.2 },
    ],
    recommendations: [
      '市场情绪过热，短期涨幅过大',
      '建议获利了结或减仓',
      '等待回调后再寻找买点',
    ],
    riskLevel: 'high',
    relatedETFs: [],
    confidence: 0.75,
  },

  // ========== NVIDIA新品发布前夕 ==========
  {
    id: 'nvidia_pre_launch_positioning',
    name: 'NVIDIA新品发布前 - 提前布局',
    description: 'NVIDIA新品即将发布，可提前布局供应链',
    conditions: [
      { metric: 'nvidiaCycle', operator: '=', value: 'pre_launch', weight: 0.4 },
      { metric: 'topKeywords', operator: 'contains', value: '发布', weight: 0.2 },
      { metric: 'institutionalAttention', operator: '>', value: 50, weight: 0.2 },
      { metric: 'mainForceNet5d', operator: '>', value: 0, weight: 0.2 },
    ],
    recommendations: [
      '提前布局芯片设计节点（供应链受益）',
      '关注封装测试节点（新一代封装技术）',
      '关注HBM存储节点（新品配套HBM需求）',
    ],
    riskLevel: 'medium',
    relatedETFs: ['512480', '159995'],
    confidence: 0.7,
  },

  // ========== 底部反转信号 ==========
  {
    id: 'bottom_reversal_signal',
    name: '底部反转信号 - 布局机会',
    description: '价格处于底部，主力资金开始流入，可能迎来反弹',
    conditions: [
      { metric: 'changePct30d', operator: '<', value: -15, weight: 0.3 },
      { metric: 'mainForceNet5d', operator: '>', value: 30000, weight: 0.3 },
      { metric: 'consecutiveDays', operator: '>', value: 3, weight: 0.2 },
      { metric: 'sentiment', operator: '>', value: 20, weight: 0.2 },
    ],
    recommendations: [
      '价格回调充分，主力资金开始介入',
      '建议分批建仓，控制仓位',
      '设置止损位，控制下行风险',
    ],
    riskLevel: 'medium',
    relatedETFs: ['515070', '512480'],
    confidence: 0.65,
  },
]

// ========== 辅助函数 ==========

/**
 * 评估市场数据是否触发投资信号
 */
export function evaluateInvestmentSignals(
  marketData: any,
  nodeType: string
): Array<{ signal: InvestmentSignal; score: number; triggeredConditions: string[] }> {
  const triggered: Array<{ signal: InvestmentSignal; score: number; triggeredConditions: string[] }> = []

  for (const signal of AI_COMPUTE_INVESTMENT_SIGNALS) {
    let totalScore = 0
    let totalWeight = 0
    const triggeredConditions: string[] = []

    for (const condition of signal.conditions) {
      const value = getMetricValue(marketData, condition.metric)

      if (value !== undefined && checkCondition(value, condition)) {
        totalScore += condition.weight
        triggeredConditions.push(condition.metric)
      }

      totalWeight += condition.weight
    }

    // 如果触发的条件权重 >= 60%，认为信号有效
    const score = totalWeight > 0 ? totalScore / totalWeight : 0
    if (score >= 0.6) {
      triggered.push({ signal, score, triggeredConditions })
    }
  }

  // 按得分排序
  return triggered.sort((a, b) => b.score - a.score)
}

/**
 * 从市场数据中获取指标值
 */
function getMetricValue(marketData: any, metric: string): any {
  // 支持嵌套路径，如 indexPerformance.changePct5d
  const parts = metric.split('.')
  let value = marketData

  for (const part of parts) {
    if (value === undefined || value === null) return undefined
    value = value[part]
  }

  return value
}

/**
 * 检查条件是否满足
 */
function checkCondition(value: any, condition: SignalCondition): boolean {
  const { operator, value: targetValue } = condition

  switch (operator) {
    case '>':
      return typeof value === 'number' && value > (targetValue as number)
    case '<':
      return typeof value === 'number' && value < (targetValue as number)
    case '>=':
      return typeof value === 'number' && value >= (targetValue as number)
    case '<=':
      return typeof value === 'number' && value <= (targetValue as number)
    case '=':
      return value === targetValue
    case 'contains':
      if (Array.isArray(value)) {
        return value.includes(targetValue)
      } else if (typeof value === 'string') {
        return value.includes(targetValue as string)
      }
      return false
    default:
      return false
  }
}

/**
 * 生成投资建议摘要
 */
export function generateInvestmentSummary(
  signals: Array<{ signal: InvestmentSignal; score: number; triggeredConditions: string[] }>
): string {
  if (signals.length === 0) {
    return '当前无明确投资信号，建议继续观察。'
  }

  const topSignal = signals[0]
  const riskLevel = topSignal.signal.riskLevel

  let summary = `**主要信号**: ${topSignal.signal.name}\n\n`
  summary += `**信号强度**: ${(topSignal.score * 100).toFixed(0)}%\n\n`
  summary += `**风险等级**: ${riskLevel === 'low' ? '低' : riskLevel === 'medium' ? '中' : '高'}\n\n`
  summary += `**建议**:\n`

  for (const rec of topSignal.signal.recommendations) {
    summary += `- ${rec}\n`
  }

  if (topSignal.signal.relatedETFs.length > 0) {
    summary += `\n**相关ETF**: ${topSignal.signal.relatedETFs.join(', ')}\n`
  }

  return summary
}
