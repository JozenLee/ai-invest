import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/lib/db/prisma'
import { fetchFundCategory } from '@/lib/services/fund-category.service'
import { matchHoldingToGraphIndustry } from '@/lib/services/portfolio-industry-matcher.service'

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
    const { ticker, name, quantity, market, industryDomain } = body
    const { unitNav } = body

    if (!ticker || !name || quantity == null || unitNav == null) {
      return NextResponse.json(
        { success: false, error: '基金代码、名称、份额和单位净值不能为空' },
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

    // 检查是否已存在同一基金持仓，存在则覆盖当前快照
    const existing = await prisma.holding.findFirst({
      where: { portfolioId: id, ticker },
    })

    let holding
    const [category, aiMatch] = await Promise.all([
      fetchFundCategory(ticker),
      industryDomain ? Promise.resolve(null) : matchHoldingToGraphIndustry({ ticker, name, category: null }),
    ])
    const manualIndustry = typeof industryDomain === 'string' && industryDomain.trim()
      ? { industryDomain: industryDomain.trim(), industryDomainCode: null, industryDomainSource: 'manual', industryDomainConfidence: 1 }
      : null
    const automaticIndustry = manualIndustry || (aiMatch ? {
      industryDomain: aiMatch.industryDomain,
      industryDomainCode: aiMatch.industryDomainCode ?? null,
      industryDomainSource: aiMatch.source,
      industryDomainConfidence: aiMatch.confidence ?? null,
    } : null)
    if (existing) {
      holding = await prisma.holding.update({
        where: { id: existing.id },
        data: {
          name,
          ...(category ? { category } : {}),
          quantity,
          unitNav,
          ...(existing.industryDomainSource === 'manual' && !manualIndustry ? {} : automaticIndustry ? { ...automaticIndustry } : {}),
        },
      })
    } else {
      holding = await prisma.holding.create({
        data: {
          portfolioId: id,
          ticker,
          market: market ?? 'A',
          name,
          ...(category ? { category } : {}),
          ...(automaticIndustry ? { ...automaticIndustry } : {}),
          quantity,
          unitNav,
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
    const { holdingId, quantity, unitNav, industryDomain } = body

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

    const hasIndustryDomain = Object.prototype.hasOwnProperty.call(body, 'industryDomain')
    const normalizedIndustryDomain = typeof industryDomain === 'string' ? industryDomain.trim() : ''
    const [category, aiMatch] = await Promise.all([
      fetchFundCategory(existing.ticker),
      hasIndustryDomain || existing.industryDomain ? Promise.resolve(null) : matchHoldingToGraphIndustry({ ticker: existing.ticker, name: existing.name, category: existing.category }),
    ])
    const industryUpdate = hasIndustryDomain
      ? normalizedIndustryDomain
        ? { industryDomain: normalizedIndustryDomain, industryDomainCode: null, industryDomainSource: 'manual', industryDomainConfidence: 1 }
        : { industryDomain: null, industryDomainCode: null, industryDomainSource: null, industryDomainConfidence: null }
      : aiMatch
        ? { industryDomain: aiMatch.industryDomain, industryDomainCode: aiMatch.industryDomainCode ?? null, industryDomainSource: aiMatch.source, industryDomainConfidence: aiMatch.confidence ?? null }
        : {}
    const holding = await prisma.holding.update({
      where: { id: holdingId },
      data: {
        ...(category ? { category } : {}),
        ...industryUpdate,
        ...(quantity != null && { quantity }),
        ...(unitNav != null && { unitNav }),
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
