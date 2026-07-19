import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db/prisma'

// GET /api/events/domains
// 获取所有领域
export async function GET() {
  try {
    const domains = await prisma.domain.findMany({
      where: { isActive: true },
      orderBy: { createdAt: 'asc' },
    })

    // 解析JSON字段
    const formattedDomains = domains.map((domain) => ({
      ...domain,
      keywords: domain.keywords ? JSON.parse(domain.keywords) : [],
      graphNodes: domain.graphNodes ? JSON.parse(domain.graphNodes) : [],
    }))

    return NextResponse.json({
      success: true,
      data: formattedDomains,
    })
  } catch (error) {
    console.error('获取领域失败:', error)
    return NextResponse.json(
      { success: false, error: '获取领域失败' },
      { status: 500 }
    )
  }
}

// POST /api/events/domains
// 创建新领域
export async function POST(request: Request) {
  try {
    const body = await request.json()
    const { name, code, description, keywords, graphNodes } = body

    // 验证必填字段
    if (!name || !code) {
      return NextResponse.json(
        { success: false, error: '名称和代码为必填项' },
        { status: 400 }
      )
    }

    // 检查code是否已存在
    const existing = await prisma.domain.findUnique({
      where: { code },
    })

    if (existing) {
      return NextResponse.json(
        { success: false, error: '领域代码已存在' },
        { status: 400 }
      )
    }

    // 创建领域
    const domain = await prisma.domain.create({
      data: {
        name,
        code,
        description: description || null,
        keywords: keywords ? JSON.stringify(keywords) : null,
        graphNodes: graphNodes ? JSON.stringify(graphNodes) : null,
      },
    })

    return NextResponse.json({
      success: true,
      data: {
        ...domain,
        keywords: domain.keywords ? JSON.parse(domain.keywords) : [],
        graphNodes: domain.graphNodes ? JSON.parse(domain.graphNodes) : [],
      },
    })
  } catch (error) {
    console.error('创建领域失败:', error)
    return NextResponse.json(
      { success: false, error: '创建领域失败' },
      { status: 500 }
    )
  }
}

// PUT /api/events/domains
// 更新领域
export async function PUT(request: Request) {
  try {
    const body = await request.json()
    const { id, name, description, keywords, graphNodes, isActive } = body

    if (!id) {
      return NextResponse.json(
        { success: false, error: '领域ID为必填项' },
        { status: 400 }
      )
    }

    const domain = await prisma.domain.update({
      where: { id },
      data: {
        ...(name && { name }),
        ...(description !== undefined && { description }),
        ...(keywords && { keywords: JSON.stringify(keywords) }),
        ...(graphNodes && { graphNodes: JSON.stringify(graphNodes) }),
        ...(isActive !== undefined && { isActive }),
      },
    })

    return NextResponse.json({
      success: true,
      data: {
        ...domain,
        keywords: domain.keywords ? JSON.parse(domain.keywords) : [],
        graphNodes: domain.graphNodes ? JSON.parse(domain.graphNodes) : [],
      },
    })
  } catch (error) {
    console.error('更新领域失败:', error)
    return NextResponse.json(
      { success: false, error: '更新领域失败' },
      { status: 500 }
    )
  }
}

// DELETE /api/events/domains?id=xxx
// 删除领域（软删除）
export async function DELETE(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const id = searchParams.get('id')

    if (!id) {
      return NextResponse.json(
        { success: false, error: '领域ID为必填项' },
        { status: 400 }
      )
    }

    // 软删除：设置isActive为false
    const domain = await prisma.domain.update({
      where: { id },
      data: { isActive: false },
    })

    return NextResponse.json({
      success: true,
      data: domain,
    })
  } catch (error) {
    console.error('删除领域失败:', error)
    return NextResponse.json(
      { success: false, error: '删除领域失败' },
      { status: 500 }
    )
  }
}
