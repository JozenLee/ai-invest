import defaults from '../../config/subscription-defaults.json'

export type SubscriptionScope = 'market_index' | 'etf_index' | 'company_quote' | 'portfolio_fund'
export type SubscriptionPolicy = { scope: string; label: string; enabled: boolean; mode: string; tradingIntervalSeconds: number; closedIntervalSeconds: number; dailyTimes: string[]; weekdaysOnly: boolean }
export type StorageRetentionConfig = {
  fetchRunDays: number
  normalizedDailyDays: number
  announcementDays: number
  financialDays: number
  unreferencedSnapshotDays: number
  researchSnapshotDays: number
  rawPayloadDays: Record<string, number>
  rawPayloadMaxVersions: Record<string, number>
}
export type SubscriptionConfig = { historyPoints: number; pollSeconds: number; requestConcurrency: number; storageRetention: StorageRetentionConfig; scopeEnabled: Record<SubscriptionScope, boolean>; policies: Record<string, SubscriptionPolicy> }
export const DEFAULT_SUBSCRIPTION_CONFIG: SubscriptionConfig = defaults
export const MARKET_INDEXES = [
  { code: 'sh000001', name: '上证指数' }, { code: 'sz399001', name: '深证成指' },
  { code: 'sz399006', name: '创业板指' }, { code: 'sh000688', name: '科创50' }, { code: 'sh000300', name: '沪深300' },
]
export const SCOPE_LABELS: Record<SubscriptionScope, string> = { market_index: '市场数据', etf_index: 'ETF指数', company_quote: '企业行情', portfolio_fund: '持仓基金' }

export function validateSubscriptionConfig(value: unknown): SubscriptionConfig {
  if (!value || typeof value !== 'object') throw new Error('无效的订阅配置')
  const config = value as SubscriptionConfig
  for (const [field, min, max] of [['historyPoints', 60, 500], ['pollSeconds', 3, 60], ['requestConcurrency', 1, 12]] as const) {
    if (!Number.isInteger(config[field]) || config[field] < min || config[field] > max) throw new Error(`${field} 必须为 ${min}–${max} 的整数`)
  }
  const result = structuredClone(defaults) as SubscriptionConfig
  Object.assign(result, { historyPoints: config.historyPoints, pollSeconds: config.pollSeconds, requestConcurrency: config.requestConcurrency })
  const retention=config.storageRetention||defaults.storageRetention
  for(const field of ['fetchRunDays','normalizedDailyDays','announcementDays','financialDays','unreferencedSnapshotDays','researchSnapshotDays'] as const){
    if(!Number.isInteger(retention[field])||retention[field]<1||retention[field]>3650)throw new Error(`${field} 必须为 1–3650 天`)
  }
  for(const [key,days] of Object.entries(retention.rawPayloadDays||{}))if(!Number.isInteger(days)||days<1||days>3650)throw new Error(`${key} 原始数据保留期必须为 1–3650 天`)
  for(const [key,count] of Object.entries(retention.rawPayloadMaxVersions||{}))if(!Number.isInteger(count)||count<1||count>1000)throw new Error(`${key} 原始版本上限必须为 1–1000`)
  result.storageRetention={...retention,rawPayloadDays:{...retention.rawPayloadDays},rawPayloadMaxVersions:{...retention.rawPayloadMaxVersions}}
  for (const scope of Object.keys(SCOPE_LABELS) as SubscriptionScope[]) {
    if (typeof config.scopeEnabled?.[scope] !== 'boolean') throw new Error('缺少模块启停配置')
    result.scopeEnabled[scope] = config.scopeEnabled[scope]
  }
  for (const key of Object.keys(defaults.policies)) {
    const policy = config.policies?.[key]
    if (!policy || typeof policy.enabled !== 'boolean' || !['interval', 'daily'].includes(policy.mode)) throw new Error(`${key} 更新策略无效`)
    for (const field of ['tradingIntervalSeconds', 'closedIntervalSeconds'] as const) {
      if (!Number.isInteger(policy[field]) || policy[field] < 30 || policy[field] > 604800) throw new Error(`${key} 更新间隔必须为 30–604800 秒`)
    }
    if (!Array.isArray(policy.dailyTimes) || policy.dailyTimes.length > 4 || policy.dailyTimes.some((time) => !/^([01]\d|2[0-3]):[0-5]\d$/.test(time))) throw new Error(`${key} 时间须为 HH:mm，最多 4 次`)
    if (policy.mode === 'daily' && !policy.dailyTimes.length) throw new Error(`${key} 至少设置一个采集时间`)
    if (typeof policy.weekdaysOnly !== 'boolean') throw new Error(`${key} 交易日配置无效`)
    result.policies[key] = { ...result.policies[key], enabled: policy.enabled, mode: policy.mode, tradingIntervalSeconds: policy.tradingIntervalSeconds, closedIntervalSeconds: policy.closedIntervalSeconds, dailyTimes: [...new Set(policy.dailyTimes)].sort(), weekdaysOnly: policy.weekdaysOnly }
  }
  return result
}
