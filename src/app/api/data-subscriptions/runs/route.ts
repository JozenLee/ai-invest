import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
export async function GET(request: NextRequest) {
  const ids = (request.nextUrl.searchParams.get('ids') || '').split(',').filter(Boolean).slice(0, 1000)
  const runs = await prisma.dataFetchRun.findMany({
    where: ids.length ? { id: { in: ids } } : undefined,
    include: { dataset: { select: { datasetKey: true } } },
    orderBy: { startedAt: ids.length ? 'asc' : 'desc' }, take: ids.length || 200,
  })
  return NextResponse.json({ success: true, data: runs, retentionLimit: 1000, displayLimit: 200 })
}
