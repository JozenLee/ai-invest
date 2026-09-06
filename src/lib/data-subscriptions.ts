import { prisma } from '@/lib/db'

export const DEFAULT_DATASETS = [
  { datasetKey: 'etf_realtime', tradingIntervalSeconds: 180, closedIntervalSeconds: 3600 },
  { datasetKey: 'etf_daily', tradingIntervalSeconds: 86400, closedIntervalSeconds: 86400 },
  { datasetKey: 'etf_holdings', tradingIntervalSeconds: 86400, closedIntervalSeconds: 86400 },
  { datasetKey: 'etf_research', tradingIntervalSeconds: 86400, closedIntervalSeconds: 86400 },
  { datasetKey: 'constituent_stock_realtime', tradingIntervalSeconds: 300, closedIntervalSeconds: 3600 },
  { datasetKey: 'constituent_stock_daily', tradingIntervalSeconds: 86400, closedIntervalSeconds: 86400 },
  { datasetKey: 'stock_financial', tradingIntervalSeconds: 86400, closedIntervalSeconds: 86400 },
  { datasetKey: 'stock_announcement', tradingIntervalSeconds: 900, closedIntervalSeconds: 3600 },
] as const

export const ETF_MARKET_DATASET_KEYS = ['etf_realtime', 'etf_daily', 'etf_holdings', 'constituent_stock_realtime', 'constituent_stock_daily'] as const

export function normalizeInstrumentCode(value: unknown) {
  return String(value || '').trim().toLowerCase().replace(/^(sh|sz|bj)(?=\d)/, '').replace(/\.(sh|sz|bj|us|o|n)$/, '').replace(/^(\d+)\.hk$/, (_match, digits: string) => `${digits.replace(/^0+/, '') || '0'}.hk`)
}

export async function getSubscription(id: string) {
  return prisma.dataSubscription.findUnique({
    where: { id },
    include: { instrument: true, datasets: { include: { runs: { orderBy: { startedAt: 'desc' }, take: 3 } } } },
  })
}
