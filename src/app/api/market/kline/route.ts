import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { MARKET_INDEXES } from '@/lib/subscription-config'
export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get('code') || ''
  const index = MARKET_INDEXES.find((item) => item.code === code || item.code.slice(2) === code)
  const period = request.nextUrl.searchParams.get('period') || 'daily'
  const count = Math.min(500, Math.max(1, Number(request.nextUrl.searchParams.get('count')) || 120))
  if (!index || !['daily', 'weekly', 'monthly'].includes(period)) return NextResponse.json({ success: false, error: '无效指数或周期' }, { status: 400 })
  const rows = await prisma.indexDaily.findMany({ where: { code: { in: [index.code, index.code.slice(2)] }, close: { gt: 0 } }, orderBy: { date: 'asc' } })
  const unique = new Map(rows.map((row) => [row.date.toISOString().slice(0, 10), row]))
  const buckets = new Map<string, { date: string; open: number; high: number; low: number; close: number; volume: number }>()
  for (const [date, row] of unique) {
    const monday = new Date(date); monday.setUTCDate(monday.getUTCDate() - (monday.getUTCDay() + 6) % 7)
    const key = period === 'monthly' ? date.slice(0, 7) : period === 'weekly' ? monday.toISOString().slice(0, 10) : date
    const previous = buckets.get(key)
    buckets.set(key, { date, open: previous?.open ?? row.open, high: Math.max(previous?.high ?? row.high, row.high), low: Math.min(previous?.low ?? row.low, row.low), close: row.close, volume: (previous?.volume || 0) + Number(row.volume) })
  }
  return NextResponse.json({ success: true, data: { code: index.code, period, klines: [...buckets.values()].slice(-count) }, source: 'subscription-database' })
}
