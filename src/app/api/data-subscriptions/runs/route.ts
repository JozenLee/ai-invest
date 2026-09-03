import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'

export async function GET(request: NextRequest) {
  const ids = (request.nextUrl.searchParams.get('ids') || '').split(',').filter(Boolean)
  if (!ids.length) return NextResponse.json({ success: false, error: '缺少运行批次' }, { status: 400 })
  const runs = await prisma.dataFetchRun.findMany({ where: { id: { in: ids } }, orderBy: { startedAt: 'asc' } })
  return NextResponse.json({ success: true, data: runs.map((run) => ({ id: run.id, targetCode: run.targetCode, status: run.status, error: run.error, fetchedCount: run.fetchedCount, storedCount: run.storedCount, completedAt: run.completedAt })) })
}
