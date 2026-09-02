import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { SUBSCRIPTION_SCOPES } from '@/lib/data-subscription-overview'

export async function GET() {
  const existing = await prisma.dataSubscriptionSchedule.findMany()
  const map = new Map(existing.map((item) => [item.scope, item]))
  const data = Object.entries(SUBSCRIPTION_SCOPES).map(([scope, defaults]) => ({ scope, ...defaults, ...(map.get(scope) || {}) }))
  return NextResponse.json({ success: true, data })
}

export async function PATCH(request: NextRequest) {
  const body = await request.json().catch(() => ({})) as Record<string, unknown>
  const scope = String(body.scope || '')
  if (!(scope in SUBSCRIPTION_SCOPES)) return NextResponse.json({ success: false, error: '无效的订阅类型' }, { status: 400 })
  const defaults = SUBSCRIPTION_SCOPES[scope as keyof typeof SUBSCRIPTION_SCOPES]
  const data = await prisma.dataSubscriptionSchedule.upsert({
    where: { scope },
    create: { scope, enabled: body.enabled !== false, tradingIntervalSeconds: Math.max(30, Number(body.tradingIntervalSeconds || defaults.tradingIntervalSeconds)), closedIntervalSeconds: Math.max(60, Number(body.closedIntervalSeconds || defaults.closedIntervalSeconds)) },
    update: {
      ...(typeof body.enabled === 'boolean' ? { enabled: body.enabled } : {}),
      ...(Number.isFinite(Number(body.tradingIntervalSeconds)) ? { tradingIntervalSeconds: Math.max(30, Number(body.tradingIntervalSeconds)) } : {}),
      ...(Number.isFinite(Number(body.closedIntervalSeconds)) ? { closedIntervalSeconds: Math.max(60, Number(body.closedIntervalSeconds)) } : {}),
    },
  })
  const datasetKeys = scope === 'etf_index' ? ['etf_realtime'] : scope === 'company_quote' ? ['constituent_stock_realtime'] : []
  if (datasetKeys.length) {
    await prisma.subscriptionDataset.updateMany({
      where: { datasetKey: { in: datasetKeys } },
      data: { tradingIntervalSeconds: data.tradingIntervalSeconds, closedIntervalSeconds: data.closedIntervalSeconds },
    })
  }
  return NextResponse.json({ success: true, data })
}
