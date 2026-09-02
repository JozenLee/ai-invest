import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { DEFAULT_DATASETS, normalizeInstrumentCode } from '@/lib/data-subscriptions'

export async function GET() {
  const subscriptions = await prisma.dataSubscription.findMany({
    include: { instrument: true, datasets: { orderBy: { datasetKey: 'asc' } } },
    orderBy: { updatedAt: 'desc' },
  })
  return NextResponse.json({ success: true, data: subscriptions })
}

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({})) as Record<string, unknown>
  const code = normalizeInstrumentCode(body.code)
  if (!/^\d{6}$/.test(code)) return NextResponse.json({ success: false, error: 'ETF代码必须是6位数字' }, { status: 400 })

  const name = typeof body.name === 'string' ? body.name.trim() : null
  const enabled = body.enabled !== false
  const profile = typeof body.profile === 'string' && body.profile.trim() ? body.profile.trim() : 'default'
  const datasets = Array.isArray(body.datasets) && body.datasets.length
    ? body.datasets.map((item) => String(item)).filter(Boolean)
    : DEFAULT_DATASETS.map((item) => item.datasetKey)

  const subscription = await prisma.$transaction(async (tx) => {
    const instrument = await tx.instrument.upsert({
      where: { type_code: { type: 'ETF', code } },
      create: { type: 'ETF', code, name, market: 'CN' },
      update: name ? { name, status: 'active' } : { status: 'active' },
    })
    return tx.dataSubscription.upsert({
      where: { instrumentId: instrument.id },
      create: {
        instrumentId: instrument.id,
        enabled,
        profile,
        datasets: { create: DEFAULT_DATASETS.filter((item) => datasets.includes(item.datasetKey)).map((item) => ({ ...item, enabled: true })) },
      },
      update: {
        enabled,
        profile,
        datasets: { deleteMany: {}, create: DEFAULT_DATASETS.filter((item) => datasets.includes(item.datasetKey)).map((item) => ({ ...item, enabled: true })) },
      },
      include: { instrument: true, datasets: true },
    })
  })

  return NextResponse.json({ success: true, data: subscription }, { status: 201 })
}
