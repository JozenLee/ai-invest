import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { getPublishSchedule, validatePublishSchedule } from '@/lib/publish-schedule'

export async function GET() {
  try {
    const data = await getPublishSchedule()
    const runs = await prisma.$queryRawUnsafe('SELECT id,slot,industryId,status,runId,reportId,error FROM publish_schedule_runs ORDER BY createdAt DESC LIMIT 30')
    return NextResponse.json({ success: true, data, runs })
  } catch { return NextResponse.json({ success: false, error: '发布计划未就绪，请检查数据库迁移' }, { status: 503 }) }
}

export async function PUT(request: NextRequest) {
  try {
    const data = validatePublishSchedule(await request.json())
    if (data.enabled) {
      const account = await prisma.xiaohongshuAccount.findUnique({ where: { id: data.accountId } })
      if (!account?.enabled || account.authType !== 'personal_app') throw new Error('发布账号不存在或已禁用')
      const snapshot = await prisma.rawPayload.findFirst({ where: { datasetKey: 'industry_graph' }, orderBy: { fetchedAt: 'desc' } })
      const ids = new Set((snapshot ? JSON.parse(snapshot.payload) : []).map((row: { id: string }) => row.id))
      if (data.industryIds.some(id => !ids.has(id))) throw new Error('所选产业不在订阅快照中，请先同步产业数据')
    }
    await prisma.$executeRawUnsafe('INSERT INTO publish_schedule (id,payload,updatedAt) VALUES (?,?,?) ON CONFLICT(id) DO UPDATE SET payload=excluded.payload,updatedAt=excluded.updatedAt', 'default', JSON.stringify(data), new Date().toISOString())
    return NextResponse.json({ success: true, data })
  } catch (error) { return NextResponse.json({ success: false, error: error instanceof Error ? error.message : '保存失败' }, { status: 400 }) }
}
