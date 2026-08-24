import { NextResponse } from 'next/server'
import prisma from '@/lib/db/prisma'
import { syncPortfolioFromEmail } from '@/lib/services/portfolio-sync.service'

function localTime(date: Date, timezone: string) {
  const parts = new Intl.DateTimeFormat('en-GB', { timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false }).formatToParts(date)
  const year = parts.find(part => part.type === 'year')?.value ?? '0000'
  const month = parts.find(part => part.type === 'month')?.value ?? '00'
  const day = parts.find(part => part.type === 'day')?.value ?? '00'
  const hour = parts.find(part => part.type === 'hour')?.value ?? '00'
  const minute = parts.find(part => part.type === 'minute')?.value ?? '00'
  return {
    time: `${hour}:${minute}`,
    minuteKey: `${year}-${month}-${day}-${hour}:${minute}`,
  }
}

export async function POST(request: Request) {
  const configuredSecret = process.env.PORTFOLIO_SYNC_SECRET
  if (configuredSecret && request.headers.get('x-portfolio-sync-secret') !== configuredSecret) {
    return NextResponse.json({ success: false, error: '未授权的定时同步请求' }, { status: 401 })
  }

  const schedules = await prisma.portfolioSyncSchedule.findMany({ where: { enabled: true } })
  const results: Array<{ portfolioId: string; success: boolean; error?: string }> = []
  for (const schedule of schedules) {
    const { time, minuteKey } = localTime(new Date(), schedule.timezone)
    const syncTimes = JSON.parse(schedule.syncTimes) as string[]
    const lastRunKey = schedule.lastRunAt ? localTime(schedule.lastRunAt, schedule.timezone).minuteKey : null
    if (!syncTimes.includes(time) || lastRunKey === minuteKey) continue
    try {
      await syncPortfolioFromEmail(schedule.portfolioId)
      await prisma.portfolioSyncSchedule.update({ where: { id: schedule.id }, data: { lastRunAt: new Date(), lastError: null } })
      results.push({ portfolioId: schedule.portfolioId, success: true })
    } catch (error) {
      const message = error instanceof Error ? error.message : '定时同步失败'
      await prisma.portfolioSyncSchedule.update({ where: { id: schedule.id }, data: { lastRunAt: new Date(), lastError: message } })
      results.push({ portfolioId: schedule.portfolioId, success: false, error: message })
    }
  }
  return NextResponse.json({ success: true, data: { checked: schedules.length, results } })
}
