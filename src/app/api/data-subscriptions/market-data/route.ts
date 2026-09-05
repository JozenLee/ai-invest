import { NextResponse } from 'next/server'
import { DEFAULT_SUBSCRIPTION_CONFIG } from '@/lib/subscription-config'
import { readMarketDataset } from '@/lib/stored-market-data'
export async function GET() {
  const keys = Object.entries(DEFAULT_SUBSCRIPTION_CONFIG.policies).filter(([key, policy]) => policy.scope === 'market_index' && !key.startsWith('index_'))
  const data = await Promise.all(keys.map(async ([key, policy]) => ({ key, label: policy.label, snapshot: await readMarketDataset(key) })))
  return NextResponse.json({ success: true, data })
}
