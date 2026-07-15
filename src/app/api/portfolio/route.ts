import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/lib/db/prisma'

// GET /api/portfolio - 获取投资组合列表
export async function GET() {
  try {
    const portfolios = await prisma.portfolio.findMany({
      include: {
        holdings: true,
        user: {
          select: { id: true, name: true, email: true },
        },
      },
      orderBy: { createdAt: 'desc' },
    })

    return NextResponse.json({
      success: true,
      data: portfolios,
    })
  } catch (error) {
    console.error('获取投资组合失败:', error)
    return NextResponse.json(
      { success: false, error: '无法获取投资组合数据', data: null },
      { status: 500 }
    )
  }
}

// POST /api/portfolio - 创建投资组合
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { name, userId } = body

    if (!name || !userId) {
      return NextResponse.json(
        { success: false, error: '名称和用户ID不能为空' },
        { status: 400 }
      )
    }

    // 验证用户存在
    const user = await prisma.user.findUnique({ where: { id: userId } })
    if (!user) {
      return NextResponse.json(
        { success: false, error: '用户不存在' },
        { status: 404 }
      )
    }

    const portfolio = await prisma.portfolio.create({
      data: {
        userId,
        name,
        isDefault: body.isDefault ?? false,
      },
      include: { holdings: true },
    })

    return NextResponse.json({ success: true, data: portfolio })
  } catch (error) {
    console.error('创建投资组合失败:', error)
    return NextResponse.json(
      { success: false, error: '创建投资组合失败' },
      { status: 500 }
    )
  }
}
