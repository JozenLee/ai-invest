import { NextResponse } from 'next/server'
import prisma from '@/lib/db/prisma'
import { syncPortfolioFromEmail } from '@/lib/services/portfolio-sync.service'

export async function POST(_request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params
    const portfolio = await prisma.portfolio.findUnique({ where: { id } })
    if (!portfolio) return NextResponse.json({ success: false, error: '投资组合不存在' }, { status: 404 })

    const parsed = await syncPortfolioFromEmail(id)
    return NextResponse.json({ success: true, data: parsed })
  } catch (error) {
    console.error('同步邮箱持仓失败:', error)
    return NextResponse.json({ success: false, error: error instanceof Error ? error.message : '同步邮箱持仓失败' }, { status: 500 })
  }
}
