import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { normalizeInstrumentCode } from '@/lib/data-subscriptions'

export async function GET(request: NextRequest, { params }: { params: Promise<{ code: string }> }) {
  const { code: rawCode } = await params
  const code = normalizeInstrumentCode(rawCode)
  const days = Math.min(Math.max(Number(request.nextUrl.searchParams.get('days') || 30), 1), 3650)
  const since = new Date(Date.now() - days * 86400000)
  const [history, holdings, subscription] = await Promise.all([
    prisma.eTFDaily.findMany({ where: { ticker: code, date: { gte: since } }, orderBy: { date: 'asc' } }),
    prisma.eTFHolding.findMany({ where: { etfCode: code }, orderBy: { weight: 'desc' } }),
    prisma.dataSubscription.findFirst({ where: { instrument: { type: 'ETF', code } }, include: { instrument: true, datasets: true } }),
  ])
  const latest = history.at(-1) || null
  return NextResponse.json({
    success: true,
    data: { ticker: code, name: subscription?.instrument.name || latest?.name || code, latest, history, holdings },
    meta: {
      source: history.length || holdings.length ? 'local-database' : 'unavailable',
      fetchedAt: latest?.date?.toISOString() || null,
      freshness: latest ? (Date.now() - latest.date.getTime() < 15 * 60 * 1000 ? 'fresh' : 'stale') : 'unavailable',
      subscribed: Boolean(subscription),
    },
  })
}
