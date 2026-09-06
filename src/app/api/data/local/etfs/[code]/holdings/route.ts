import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { normalizeInstrumentCode } from '@/lib/data-subscriptions'

export async function GET(_request: Request, { params }: { params: Promise<{ code: string }> }) {
  const code = normalizeInstrumentCode((await params).code)
  const rows = await prisma.eTFHolding.findMany({ where: { etfCode: code }, orderBy: { weight: 'desc' } })
  const latest = rows.at(0)?.updateDate || null
  return NextResponse.json({
    success: true,
    data: rows,
    meta: {
      source: rows.length ? 'local-database' : 'unavailable',
      fetchedAt: latest?.toISOString() || null,
      freshness: latest ? (Date.now() - latest.getTime() < 86400000 ? 'fresh' : 'stale') : 'unavailable',
    },
  })
}
