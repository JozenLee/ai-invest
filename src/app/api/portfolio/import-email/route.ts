import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { syncPortfolioFromEmail } from '@/lib/services/portfolio-sync.service'
export const maxDuration = 300
export async function POST() {
  try {
    let portfolio = await prisma.portfolio.findFirst({ orderBy: [{ isDefault: 'desc' }, { createdAt: 'asc' }] })
    if (!portfolio) {
      const email = process.env.PORTFOLIO_IMAP_USER
      if (!email) return NextResponse.json({ success: false, error: '请先配置持仓邮箱' }, { status: 400 })
      const user = await prisma.user.upsert({ where: { email }, create: { email, name: '本地投资者', password: '!disabled-email-import' }, update: {} })
      portfolio = await prisma.portfolio.create({ data: { userId: user.id, name: '邮箱持仓', isDefault: true } })
    }
    const result = await syncPortfolioFromEmail(portfolio.id)
    return NextResponse.json({ success: true, portfolioId: portfolio.id, count: result.holdings.length, holdingsDate: result.holdingsDate, balanceDate: result.balanceDate })
  } catch (error) { return NextResponse.json({ success: false, error: error instanceof Error ? error.message : '导入失败' }, { status: 500 }) }
}
