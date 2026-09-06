import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db/prisma'
import { Prisma } from '@prisma/client'

export async function GET(request: NextRequest) {
  try {
    const params = request.nextUrl.searchParams
    const sourceId = params.get('sourceId'), status = params.get('status')
    const limit = Math.max(1, Math.min(parseInt(params.get('limit') || '50') || 50, 100))
    const offset = Math.max(0, parseInt(params.get('offset') || '0') || 0)
    // Deleted sources retain immutable log snapshots in the local archive.
    const history = Prisma.sql`
      SELECT l.id,l.sourceId,d.name AS sourceName,l.status,l.message,l.fetchedCount,l.processedCount,l.failedCount,l.duration,l.errorDetail AS error,l.createdAt,0 AS archived
      FROM DataSourceLog l JOIN DataSource d ON d.id=l.sourceId
      UNION ALL
      SELECT json_extract(j.value,'$.id'),r.targetCode,json_extract(r.payload,'$.source.name'),
        json_extract(j.value,'$.status'),json_extract(j.value,'$.message'),
        json_extract(j.value,'$.fetchedCount'),json_extract(j.value,'$.processedCount'),
        json_extract(j.value,'$.failedCount'),json_extract(j.value,'$.duration'),
        json_extract(j.value,'$.errorDetail'),json_extract(j.value,'$.createdAt'),1
      FROM raw_payloads r JOIN json_each(r.payload,'$.logs') j
      WHERE r.datasetKey='deleted_news_source'`
    const filters: Prisma.Sql[] = []
    if (sourceId) filters.push(Prisma.sql`sourceId=${sourceId}`)
    if (status) filters.push(Prisma.sql`status=${status}`)
    const where = filters.length ? Prisma.sql`WHERE ${Prisma.join(filters,' AND ')}` : Prisma.empty
    const counts = await prisma.$queryRaw<Array<{ total: number | bigint }>>(Prisma.sql`SELECT COUNT(*) AS total FROM (${history}) h ${where}`)
    const logs = await prisma.$queryRaw<Array<Record<string, any>>>(Prisma.sql`
      SELECT * FROM (${history}) h ${where}
      ORDER BY CASE WHEN CAST(createdAt AS TEXT) NOT LIKE '%-%' THEN CAST(createdAt AS REAL)
        ELSE (julianday(CASE WHEN length(createdAt) IN (19,26) THEN createdAt || '+08:00' ELSE createdAt END)-2440587.5)*86400000 END DESC
      LIMIT ${limit} OFFSET ${offset}`)
    const items = logs.map(log => {
      const raw = String(log.createdAt)
      const date = /^\d+$/.test(raw) ? new Date(Number(raw)) : new Date(/[zZ]$|[+-]\d{2}:\d{2}$/.test(raw) ? raw : raw+'+08:00')
      return { ...log, archived: Boolean(log.archived), message: (log.archived ? '【已删除源归档】' : '') + (log.message || ''), createdAt: date.toISOString(), duration: Number(log.duration || 0), fetchedCount: Number(log.fetchedCount || 0), processedCount: Number(log.processedCount || 0), failedCount: Number(log.failedCount || 0) }
    })
    return NextResponse.json({success:true,data:{total:Number(counts[0].total),items,limit,offset}})
  } catch(error) {
    console.error('读取资讯更新记录失败',error)
    return NextResponse.json({success:false,error:'读取更新记录失败'}, {status:500})
  }
}
