import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
export async function GET() {
  const [snapshot, subscriptions] = await Promise.all([
    prisma.rawPayload.findFirst({ where: { datasetKey: 'industry_graph' }, orderBy: { fetchedAt: 'desc' } }),
    prisma.dataSubscription.findMany({ where: { enabled: true, instrument: { type: 'ETF' } }, include: { instrument: true } }),
  ])
  const codes = new Set(subscriptions.map((row) => row.instrument.code))
  const groups = new Map<string, { id: string; name: string }>()
  if (snapshot) for (const group of JSON.parse(snapshot.payload)) {
    if (group.etfs?.some((etf: any) => codes.has(etf.code))) groups.set(group.id, { id: group.id, name: group.name })
  }
  for (const row of subscriptions) {
    try { const profile = JSON.parse(row.profile || '{}'); if (profile.industryId && !groups.has(profile.industryId)) groups.set(profile.industryId, { id: profile.industryId, name: profile.industryName || profile.industryId }) } catch { /* Non-JSON legacy profile. */ }
  }
  return NextResponse.json({ success: true, data: [...groups.values()] })
}
