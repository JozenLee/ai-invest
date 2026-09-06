import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { normalizeInstrumentCode } from '@/lib/data-subscriptions'
import { getSubscriptionConfig } from '@/lib/subscription-config-store'
import { announcementView, financialView, marketDetail } from '@/lib/market-detail'

function jsonSafe<T>(value: T): T {
  return JSON.parse(JSON.stringify(value, (_key, item) => typeof item === 'bigint' ? Number(item) : item)) as T
}
function normalizedCode(value: unknown) {
  const normalized = normalizeInstrumentCode(value).replace(/\.(sh|sz)$/, '')
  return normalized.replace(/^(\d+)\.hk$/, (_match, digits: string) => `${digits.replace(/^0+/, '') || '0'}.hk`)
}
function placeholderName(name: unknown, code: string) {
  const value = String(name || '').trim()
  return !value || ['nan', 'none', 'null'].includes(value.toLowerCase()) || normalizedCode(value) === normalizedCode(code)
}

export async function GET(request: NextRequest) {
  const type = request.nextUrl.searchParams.get('type')
  const rawCode = request.nextUrl.searchParams.get('code')
  if (!type || !rawCode) return NextResponse.json({ success: false, error: '缺少详情参数' }, { status: 400 })
  const code = normalizedCode(rawCode)
  const { historyPoints } = await getSubscriptionConfig()

  if (type === 'etf') {
    const [history, quote, holdings] = await Promise.all([
      prisma.eTFDaily.findMany({ where: { ticker: code, open: { gt: 0 }, high: { gt: 0 }, low: { gt: 0 }, close: { gt: 0 } }, orderBy: { date: 'desc' }, take: historyPoints }),
      prisma.marketQuote.findUnique({ where: { instrumentType_code: { instrumentType: 'ETF', code } } }),
      prisma.eTFHolding.findMany({ where: { etfCode: code }, orderBy: { weight: 'desc' }, take: 10 }),
    ])
    const holdingCodes = holdings.map((holding) => normalizedCode(holding.stockCode))
    const [graphStocks, instruments] = await Promise.all([
      prisma.graphStock.findMany({ where: { stockCode: { in: holdingCodes } }, select: { stockCode: true, stockName: true } }),
      prisma.instrument.findMany({ where: { type: 'STOCK', code: { in: holdingCodes } }, select: { code: true, name: true } }),
    ])
    const names = new Map([...graphStocks.map((item) => [normalizedCode(item.stockCode), item.stockName] as const), ...instruments.map((item) => [normalizedCode(item.code), item.name] as const)])
    const namedHoldings = holdings.map((holding) => { const name = names.get(normalizedCode(holding.stockCode)); return { ...holding, stockName: name && !placeholderName(name, holding.stockCode) ? name : holding.stockName } })
    return NextResponse.json({ success: true, data: jsonSafe({ ...marketDetail(history.reverse() as unknown as Array<Record<string, unknown>>, quote as unknown as Record<string, unknown> | null, historyPoints), holdings: namedHoldings }) })
  }
  if (type === 'company') {
    const [history, quote, financials, announcements] = await Promise.all([
      prisma.stockDaily.findMany({ where: { ticker: code, open: { gt: 0 }, high: { gt: 0 }, low: { gt: 0 }, close: { gt: 0 } }, orderBy: { date: 'desc' }, take: historyPoints }),
      prisma.marketQuote.findUnique({ where: { instrumentType_code: { instrumentType: 'STOCK', code } } }),
      prisma.stockFinancialReport.findMany({ where: { stockCode: code }, orderBy: { fetchedAt: 'desc' } }),
      prisma.stockAnnouncement.findMany({ where: { stockCode: code }, orderBy: { publishDate: 'desc' }, take: 8 }),
    ])
    const uniqueReports = new Map<string, (typeof financials)[number]>()
    for (const report of financials) {
      const key = `${report.reportType}:${report.reportPeriod.replace(/-/g, '')}`
      if (!uniqueReports.has(key)) uniqueReports.set(key, report)
    }
    const reports = [...uniqueReports.values()].sort((a, b) => b.reportPeriod.replace(/-/g, '').localeCompare(a.reportPeriod.replace(/-/g, ''))).slice(0, 24)
    return NextResponse.json({ success: true, data: jsonSafe({ ...marketDetail(history.reverse() as unknown as Array<Record<string, unknown>>, quote as unknown as Record<string, unknown> | null, historyPoints), financials: reports.map(financialView), announcements: announcements.map(announcementView) }) })
  }
  if (type === 'market') {
    const aliases = [rawCode, rawCode.toLowerCase(), code, `sh${code}`, `sz${code}`]
    const [history, quote] = await Promise.all([
      prisma.indexDaily.findMany({ where: { code: { in: aliases }, open: { gt: 0 }, high: { gt: 0 }, low: { gt: 0 }, close: { gt: 0 } }, orderBy: { date: 'desc' }, take: historyPoints * 2 }),
      prisma.marketQuote.findUnique({ where: { instrumentType_code: { instrumentType: 'INDEX', code: rawCode.toLowerCase() } } }),
    ])
    return NextResponse.json({ success: true, data: jsonSafe(marketDetail(history.reverse() as unknown as Array<Record<string, unknown>>, quote as unknown as Record<string, unknown> | null, historyPoints)) })
  }
  return NextResponse.json({ success: false, error: '无效详情类型' }, { status: 400 })
}
