import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/lib/db/prisma'

interface RouteContext {
  params: Promise<{ id: string }>
}

// GET /api/portfolio/[id]/holdings - 获取组合持仓
export async function GET(_request: NextRequest, context: RouteContext) {
  try {
    const { id } = await context.params

    const portfolio = await prisma.portfolio.findUnique({
      where: { id },
      include: { holdings: true },
    })

    if (!portfolio) {
      return NextResponse.json(
        { success: false, error: '投资组合不存在' },
        { status: 404 }
      )
    }

    return NextResponse.json({
      success: true,
      data: portfolio.holdings,
    })
  } catch (error) {
    console.error('获取持仓失败:', error)
    return NextResponse.json(
      { success: false, error: '获取持仓数据失败', data: null },
      { status: 500 }
    )
  }
}

// POST /api/portfolio/[id]/holdings - 添加持仓
export async function POST(request: NextRequest, context: RouteContext) {
  try {
    const { id } = await context.params
    const body = await request.json()
    const { ticker, name, quantity, avgCost, market } = body

    if (!ticker || !name || quantity == null || avgCost == null) {
      return NextResponse.json(
        { success: false, error: 'ETF代码、名称、份额和成本不能为空' },
        { status: 400 }
      )
    }

    // 验证组合存在
    const portfolio = await prisma.portfolio.findUnique({ where: { id } })
    if (!portfolio) {
      return NextResponse.json(
        { success: false, error: '投资组合不存在' },
        { status: 404 }
      )
    }

    // 检查是否已存在同一ETF持仓，存在则合并
    const existing = await prisma.holding.findFirst({
      where: { portfolioId: id, ticker },
    })

    let holding
    if (existing) {
      // 合并持仓：加权平均成本
      const totalQuantity = existing.quantity + quantity
      const totalCost = existing.avgCost * existing.quantity + avgCost * quantity
      const newAvgCost = totalCost / totalQuantity

      holding = await prisma.holding.update({
        where: { id: existing.id },
        data: {
          quantity: totalQuantity,
          avgCost: newAvgCost,
          currentPrice: body.currentPrice ?? existing.currentPrice,
        },
      })
    } else {
      holding = await prisma.holding.create({
        data: {
          portfolioId: id,
          ticker,
          market: market ?? 'A',
          name,
          quantity,
          avgCost,
          currentPrice: body.currentPrice ?? null,
        },
      })
    }

    return NextResponse.json({ success: true, data: holding })
  } catch (error) {
    console.error('添加持仓失败:', error)
    return NextResponse.json(
      { success: false, error: '添加持仓失败' },
      { status: 500 }
    )
  }
}

// PUT /api/portfolio/[id]/holdings - 更新持仓
export async function PUT(request: NextRequest, context: RouteContext) {
  try {
    const { id } = await context.params
    const body = await request.json()
    const { holdingId, quantity, avgCost, currentPrice } = body

    if (!holdingId) {
      return NextResponse.json(
        { success: false, error: '持仓ID不能为空' },
        { status: 400 }
      )
    }

    // 验证持仓属于该组合
    const existing = await prisma.holding.findFirst({
      where: { id: holdingId, portfolioId: id },
    })

    if (!existing) {
      return NextResponse.json(
        { success: false, error: '持仓不存在' },
        { status: 404 }
      )
    }

    const holding = await prisma.holding.update({
      where: { id: holdingId },
      data: {
        ...(quantity != null && { quantity }),
        ...(avgCost != null && { avgCost }),
        ...(currentPrice != null && { currentPrice }),
      },
    })

    return NextResponse.json({ success: true, data: holding })
  } catch (error) {
    console.error('更新持仓失败:', error)
    return NextResponse.json(
      { success: false, error: '更新持仓失败' },
      { status: 500 }
    )
  }
}

// DELETE /api/portfolio/[id]/holdings - 删除持仓
export async function DELETE(request: NextRequest, context: RouteContext) {
  try {
    const { id } = await context.params
    const { searchParams } = new URL(request.url)
    const holdingId = searchParams.get('holdingId')

    if (!holdingId) {
      return NextResponse.json(
        { success: false, error: '持仓ID不能为空' },
        { status: 400 }
      )
    }

    // 验证持仓属于该组合
    const existing = await prisma.holding.findFirst({
      where: { id: holdingId, portfolioId: id },
    })

    if (!existing) {
      return NextResponse.json(
        { success: false, error: '持仓不存在' },
        { status: 404 }
      )
    }

    await prisma.holding.delete({ where: { id: holdingId } })

    return NextResponse.json({ success: true, data: null })
  } catch (error) {
    console.error('删除持仓失败:', error)
    return NextResponse.json(
      { success: false, error: '删除持仓失败' },
      { status: 500 }
    )
  }
}
