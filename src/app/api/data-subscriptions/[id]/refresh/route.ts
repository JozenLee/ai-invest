import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { NoSubscriptionTargetsError, queueSubscriptionRefresh, SubscriptionDispatchError } from '@/lib/subscription-refresh'

export async function POST(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const subscription = await prisma.dataSubscription.findUnique({ include: { instrument: true, datasets: true }, where: { id } })
  if (!subscription) return NextResponse.json({ success: false, error: '订阅不存在' }, { status: 404 })
  if (!subscription.enabled) return NextResponse.json({ success: false, error: '订阅已停用' }, { status: 409 })

  try {
    const data = await queueSubscriptionRefresh({ subscriptionId: id })
    return NextResponse.json({ success: true, data: { subscriptionId: id, queuedRuns: data.queuedDatasets, runIds: data.runIds, status: 'dispatched', schedulerNotified: true } }, { status: 202 })
  } catch (error) {
    const status = error instanceof NoSubscriptionTargetsError ? 409 : error instanceof SubscriptionDispatchError ? 503 : 500
    return NextResponse.json({ success: false, error: error instanceof Error ? error.message : '同步失败' }, { status })
  }
}
