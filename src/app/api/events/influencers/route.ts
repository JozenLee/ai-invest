import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db/prisma'
import { dataClient } from '@/lib/data-client'

// GET /api/events/influencers
// 获取大V列表
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const platform = searchParams.get('platform')
    const category = searchParams.get('category')
    const isActive = searchParams.get('isActive')

    // 构建查询条件
    const where: any = {}
    if (platform) where.platform = platform
    if (category) where.category = category
    if (isActive !== null) where.isActive = isActive === 'true'

    // 从数据库获取大V列表
    const influencers = await prisma.influencer.findMany({
      where,
      include: {
        _count: {
          select: { posts: true },
        },
      },
      orderBy: { createdAt: 'desc' },
    })

    // 格式化返回数据
    const formattedInfluencers = influencers.map((inf) => ({
      ...inf,
      tags: inf.tags ? JSON.parse(inf.tags) : [],
      postCount: inf._count.posts,
      _count: undefined,
    }))

    return NextResponse.json({
      success: true,
      data: formattedInfluencers,
    })
  } catch (error) {
    console.error('获取大V列表失败:', error)
    return NextResponse.json(
      { success: false, error: '获取大V列表失败' },
      { status: 500 }
    )
  }
}

// POST /api/events/influencers
// 添加大V
export async function POST(request: Request) {
  try {
    const body = await request.json()
    const { name, platform, accountId, profileUrl, avatarUrl, category, tags } = body

    // 验证必填字段
    if (!name || !platform || !accountId) {
      return NextResponse.json(
        { success: false, error: '名称、平台和账号ID为必填项' },
        { status: 400 }
      )
    }

    // 检查是否已存在
    const existing = await prisma.influencer.findUnique({
      where: {
        platform_accountId: {
          platform,
          accountId,
        },
      },
    })

    if (existing) {
      return NextResponse.json(
        { success: false, error: '该大V已存在' },
        { status: 400 }
      )
    }

    // 创建大V
    const influencer = await prisma.influencer.create({
      data: {
        name,
        platform,
        accountId,
        profileUrl: profileUrl || null,
        avatarUrl: avatarUrl || null,
        category: category || null,
        tags: tags ? JSON.stringify(tags) : null,
      },
    })

    return NextResponse.json({
      success: true,
      data: {
        ...influencer,
        tags: influencer.tags ? JSON.parse(influencer.tags) : [],
      },
    })
  } catch (error) {
    console.error('添加大V失败:', error)
    return NextResponse.json(
      { success: false, error: '添加大V失败' },
      { status: 500 }
    )
  }
}

// PUT /api/events/influencers
// 更新大V信息
export async function PUT(request: Request) {
  try {
    const body = await request.json()
    const { id, name, profileUrl, avatarUrl, category, tags, isActive } = body

    if (!id) {
      return NextResponse.json(
        { success: false, error: '大V ID为必填项' },
        { status: 400 }
      )
    }

    const influencer = await prisma.influencer.update({
      where: { id },
      data: {
        ...(name && { name }),
        ...(profileUrl !== undefined && { profileUrl }),
        ...(avatarUrl !== undefined && { avatarUrl }),
        ...(category !== undefined && { category }),
        ...(tags && { tags: JSON.stringify(tags) }),
        ...(isActive !== undefined && { isActive }),
      },
    })

    return NextResponse.json({
      success: true,
      data: {
        ...influencer,
        tags: influencer.tags ? JSON.parse(influencer.tags) : [],
      },
    })
  } catch (error) {
    console.error('更新大V失败:', error)
    return NextResponse.json(
      { success: false, error: '更新大V失败' },
      { status: 500 }
    )
  }
}

// DELETE /api/events/influencers?id=xxx
// 删除大V（软删除）
export async function DELETE(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const id = searchParams.get('id')

    if (!id) {
      return NextResponse.json(
        { success: false, error: '大V ID为必填项' },
        { status: 400 }
      )
    }

    // 软删除：设置isActive为false
    const influencer = await prisma.influencer.update({
      where: { id },
      data: { isActive: false },
    })

    return NextResponse.json({
      success: true,
      data: influencer,
    })
  } catch (error) {
    console.error('删除大V失败:', error)
    return NextResponse.json(
      { success: false, error: '删除大V失败' },
      { status: 500 }
    )
  }
}
