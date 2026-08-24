import { NextResponse } from 'next/server'
import prisma from '@/lib/db/prisma'

const DEFAULT_TIMES = ['00:00', '12:00']

function normaliseTimes(value: unknown) {
  const values = Array.isArray(value) ? value : DEFAULT_TIMES
  const times = [...new Set(values.filter(item => typeof item === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(item)))]
    .sort()
  if (times.length < 1 || times.length > 4) throw new Error('同步时间需要设置 1 到 4 个有效时间点')
  return times
}

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params
  const portfolio = await prisma.portfolio.findUnique({ where: { id } })
  if (!portfolio) return NextResponse.json({ success: false, error: '投资组合不存在' }, { status: 404 })
  const schedule = await prisma.portfolioSyncSchedule.upsert({
    where: { portfolioId: id },
    create: { portfolioId: id, syncTimes: JSON.stringify(DEFAULT_TIMES) },
    update: {},
  })
  return NextResponse.json({
    success: true,
    data: { ...schedule, syncTimes: JSON.parse(schedule.syncTimes) },
  })
}

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params
    const body = await request.json()
    const portfolio = await prisma.portfolio.findUnique({ where: { id } })
    if (!portfolio) return NextResponse.json({ success: false, error: '投资组合不存在' }, { status: 404 })
    const syncTimes = normaliseTimes(body.syncTimes)
    const schedule = await prisma.portfolioSyncSchedule.upsert({
      where: { portfolioId: id },
      create: { portfolioId: id, enabled: body.enabled !== false, timezone: body.timezone ?? 'Asia/Shanghai', syncTimes: JSON.stringify(syncTimes) },
      update: { enabled: body.enabled !== false, timezone: body.timezone ?? 'Asia/Shanghai', syncTimes: JSON.stringify(syncTimes), lastError: null },
    })
    return NextResponse.json({ success: true, data: { ...schedule, syncTimes } })
  } catch (error) {
    return NextResponse.json({ success: false, error: error instanceof Error ? error.message : '保存同步计划失败' }, { status: 400 })
  }
}
