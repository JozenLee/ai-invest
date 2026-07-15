// 应用常量定义

export const APP_CONFIG = {
  name: process.env.APP_NAME || 'AI投资分析系统',
  url: process.env.APP_URL || 'http://localhost:3000',
  description: '面向个人投资者的智能投研分析平台',
} as const

// API配置
export const API_CONFIG = {
  dataServiceUrl: process.env.DATA_SERVICE_URL || 'http://localhost:8000',
  claudeModel: process.env.CLAUDE_MODEL || 'claude-sonnet-4-20250514',
} as const

// 分页配置
export const PAGINATION = {
  defaultPage: 1,
  defaultPageSize: 20,
  maxPageSize: 100,
} as const

// 缓存TTL（毫秒）
export const CACHE_TTL = {
  realtime: 5 * 60 * 1000,      // 5分钟
  daily: 24 * 60 * 60 * 1000,   // 24小时
  weekly: 7 * 24 * 60 * 60 * 1000, // 7天
} as const

// 评分权重
export const SCORE_WEIGHTS = {
  technical: 0.15,
  capitalFlow: 0.20,
  sentiment: 0.10,
  event: 0.15,
  graph: 0.15,
  etfQuality: 0.15,
  valuation: 0.10,
} as const

// 信号规则
export const SIGNAL_RULES = {
  trend: {
    bullish: [
      { condition: 'MACD金叉', score: 15 },
      { condition: 'MA多头排列(5>10>20>60)', score: 20 },
      { condition: 'ADX>25且+DI>-DI', score: 15 },
      { condition: '价格站上SAR', score: 10 },
    ],
    bearish: [
      { condition: 'MACD死叉', score: -15 },
      { condition: 'MA空头排列', score: -20 },
      { condition: 'ADX>25且+DI<-DI', score: -15 },
      { condition: '价格跌破SAR', score: -10 },
    ],
  },
  momentum: {
    bullish: [
      { condition: 'RSI<30(超卖)', score: 15 },
      { condition: 'KDJ金叉且<20', score: 15 },
      { condition: 'RSI底背离', score: 20 },
    ],
    bearish: [
      { condition: 'RSI>70(超买)', score: -15 },
      { condition: 'KDJ死叉且>80', score: -15 },
      { condition: 'RSI顶背离', score: -20 },
    ],
  },
  volume: {
    bullish: [
      { condition: '放量上涨(量比>1.5)', score: 15 },
      { condition: 'OBV创新高', score: 10 },
    ],
    bearish: [
      { condition: '放量下跌', score: -15 },
      { condition: '缩量反弹', score: -10 },
    ],
  },
} as const

// 事件分类
export const EVENT_CATEGORIES = {
  POLICY: 'policy',
  EARNINGS: 'earnings',
  PRODUCT: 'product',
  PARTNERSHIP: 'partnership',
  SUPPLY_CHAIN: 'supply',
  TECHNOLOGY: 'tech',
  MARKET: 'market',
  REGULATION: 'regulation',
} as const

// 节点类型
export const NODE_TYPES = {
  // 层级节点
  INDEX: 'index',
  INDUSTRY_L1: 'industry_l1',
  INDUSTRY_L2: 'industry_l2',
  SUB_SECTOR: 'sub_sector',
  STOCK: 'stock',
  // 产业链节点
  CHIP_DESIGN: 'chip_design',
  WAFER_FOUNDRY: 'wafer_foundry',
  PACKAGING: 'packaging',
  EQUIPMENT: 'equipment',
  MATERIAL: 'material',
  EDA: 'eda',
  MEMORY: 'memory',
  SERVER: 'server',
  COOLING: 'cooling',
  POWER: 'power',
  PCB: 'pcb',
  NETWORKING: 'networking',
  DATA_CENTER: 'data_center',
  CLOUD: 'cloud',
  AI_APPLICATION: 'ai_application',
  TERMINAL_DEVICE: 'terminal_device',
  OPTICAL_COMM: 'optical_comm',
  CPO: 'cpo',
  OPTICAL_MODULE: 'optical_module',
  // 外部驱动节点
  POLICY: 'policy',
  MACRO: 'macro',
  TECHNOLOGY: 'technology',
  DEMAND: 'demand',
} as const

// 关系类型
export const RELATION_TYPES = {
  SUPPLY_CHAIN: 'supply_chain',
  DEMAND_DRIVER: 'demand_driver',
  COMPETITION: 'competition',
  COMPLEMENT: 'complement',
  POLICY_IMPACT: 'policy_impact',
  TECH_ENABLE: 'tech_enable',
  COST_PRESSURE: 'cost_pressure',
  SUBSTITUTION: 'substitution',
  CAPITAL_CYCLE: 'capital_cycle',
} as const
