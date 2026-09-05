import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { getSubscriptionConfig } from '@/lib/subscription-config-store'
import { validateSubscriptionConfig } from '@/lib/subscription-config'

export async function GET() {
  return NextResponse.json({ success: true, data: await getSubscriptionConfig() })
}

export async function PATCH(request: NextRequest) {
  try {
    const config = validateSubscriptionConfig(await request.json())
    const previous = await getSubscriptionConfig()
    await prisma.$transaction([
      prisma.subscriptionConfiguration.upsert({ where: { id: 'global' }, create: { id: 'global', payload: JSON.stringify(config) }, update: { payload: JSON.stringify(config) } }),
      ...Object.entries(config.policies).filter(([key, policy]) => JSON.stringify(policy) !== JSON.stringify(previous.policies[key]) || (config.historyPoints > previous.historyPoints && key.endsWith('_daily'))).map(([key, policy]) =>
        prisma.subscriptionDataset.updateMany({ where: { datasetKey: key }, data: { tradingIntervalSeconds: policy.tradingIntervalSeconds, closedIntervalSeconds: policy.closedIntervalSeconds, nextRunAt: null } })),
    ])
    return NextResponse.json({ success: true, data: config })
  } catch (error) {
    return NextResponse.json({ success: false, error: error instanceof Error ? error.message : '保存配置失败' }, { status: 400 })
  }
}
