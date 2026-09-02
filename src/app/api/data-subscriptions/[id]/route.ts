import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { getSubscription } from '@/lib/data-subscriptions'

export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const subscription = await getSubscription(id)
  if (!subscription) return NextResponse.json({ success: false, error: '订阅不存在' }, { status: 404 })
  return NextResponse.json({ success: true, data: subscription })
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const body = await request.json().catch(() => ({})) as Record<string, unknown>
  const existing = await prisma.dataSubscription.findUnique({ where: { id } })
  if (!existing) return NextResponse.json({ success: false, error: '订阅不存在' }, { status: 404 })
  const update: { enabled?: boolean; profile?: string } = {}
  if (typeof body.enabled === 'boolean') update.enabled = body.enabled
  if (typeof body.profile === 'string' && body.profile.trim()) update.profile = body.profile.trim()
  const datasetConfig = Array.isArray(body.datasets) ? body.datasets : null
  const subscription = await prisma.$transaction(async (tx) => {
    const updated = await tx.dataSubscription.update({ where: { id }, data: update, include: { instrument: true, datasets: true } })
    if (datasetConfig) {
      for (const item of datasetConfig) {
        if (!item || typeof item !== 'object') continue
        const value = item as Record<string, unknown>
        const datasetKey = String(value.datasetKey || '')
        if (!datasetKey) continue
        await tx.subscriptionDataset.updateMany({ where: { subscriptionId: id, datasetKey }, data: {
          ...(typeof value.enabled === 'boolean' ? { enabled: value.enabled } : {}),
          ...(Number.isFinite(Number(value.tradingIntervalSeconds)) ? { tradingIntervalSeconds: Math.max(30, Number(value.tradingIntervalSeconds)) } : {}),
          ...(Number.isFinite(Number(value.closedIntervalSeconds)) ? { closedIntervalSeconds: Math.max(60, Number(value.closedIntervalSeconds)) } : {}),
        } })
      }
    }
    return tx.dataSubscription.findUnique({ where: { id }, include: { instrument: true, datasets: true } })
  })
  return NextResponse.json({ success: true, data: subscription })
}

export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const existing = await prisma.dataSubscription.findUnique({ where: { id } })
  if (!existing) return NextResponse.json({ success: false, error: '订阅不存在' }, { status: 404 })
  await prisma.dataSubscription.delete({ where: { id } })
  return NextResponse.json({ success: true })
}
