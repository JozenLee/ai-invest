import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db/prisma'

// GET /api/events/categories
// 获取分类树形结构
export async function GET() {
  try {
    // 获取所有分类
    const categories = await prisma.newsCategory.findMany({
      where: { isActive: true },
      orderBy: { sortOrder: 'asc' },
    })

    // 构建树形结构
    const tree = buildCategoryTree(categories)

    return NextResponse.json({
      success: true,
      data: tree,
    })
  } catch (error) {
    console.error('获取分类失败:', error)
    return NextResponse.json(
      { success: false, error: '获取分类失败' },
      { status: 500 }
    )
  }
}

// POST /api/events/categories
// 创建新分类
export async function POST(request: Request) {
  try {
    const body = await request.json()
    const { name, code, parentId, sortOrder } = body

    // 验证必填字段
    if (!name || !code) {
      return NextResponse.json(
        { success: false, error: '名称和代码为必填项' },
        { status: 400 }
      )
    }

    // 检查code是否已存在
    const existing = await prisma.newsCategory.findUnique({
      where: { code },
    })

    if (existing) {
      return NextResponse.json(
        { success: false, error: '分类代码已存在' },
        { status: 400 }
      )
    }

    // 创建分类
    const category = await prisma.newsCategory.create({
      data: {
        name,
        code,
        parentId: parentId || null,
        sortOrder: sortOrder || 0,
      },
    })

    return NextResponse.json({
      success: true,
      data: category,
    })
  } catch (error) {
    console.error('创建分类失败:', error)
    return NextResponse.json(
      { success: false, error: '创建分类失败' },
      { status: 500 }
    )
  }
}

// PUT /api/events/categories
// 更新分类
export async function PUT(request: Request) {
  try {
    const body = await request.json()
    const { id, name, parentId, sortOrder, isActive } = body

    if (!id) {
      return NextResponse.json(
        { success: false, error: '分类ID为必填项' },
        { status: 400 }
      )
    }

    const category = await prisma.newsCategory.update({
      where: { id },
      data: {
        ...(name && { name }),
        ...(parentId !== undefined && { parentId }),
        ...(sortOrder !== undefined && { sortOrder }),
        ...(isActive !== undefined && { isActive }),
      },
    })

    return NextResponse.json({
      success: true,
      data: category,
    })
  } catch (error) {
    console.error('更新分类失败:', error)
    return NextResponse.json(
      { success: false, error: '更新分类失败' },
      { status: 500 }
    )
  }
}

// DELETE /api/events/categories?id=xxx
// 删除分类（软删除）
export async function DELETE(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const id = searchParams.get('id')

    if (!id) {
      return NextResponse.json(
        { success: false, error: '分类ID为必填项' },
        { status: 400 }
      )
    }

    // 软删除：设置isActive为false
    const category = await prisma.newsCategory.update({
      where: { id },
      data: { isActive: false },
    })

    return NextResponse.json({
      success: true,
      data: category,
    })
  } catch (error) {
    console.error('删除分类失败:', error)
    return NextResponse.json(
      { success: false, error: '删除分类失败' },
      { status: 500 }
    )
  }
}

// 辅助函数：构建分类树
interface CategoryNode {
  id: string
  name: string
  code: string
  parentId: string | null
  sortOrder: number
  children?: CategoryNode[]
}

function buildCategoryTree(categories: CategoryNode[]): CategoryNode[] {
  const map = new Map<string, CategoryNode>()
  const roots: CategoryNode[] = []

  // 先建立id到节点的映射
  for (const cat of categories) {
    map.set(cat.id, { ...cat, children: [] })
  }

  // 构建树
  for (const cat of categories) {
    const node = map.get(cat.id)!
    if (cat.parentId && map.has(cat.parentId)) {
      const parent = map.get(cat.parentId)!
      parent.children!.push(node)
    } else {
      roots.push(node)
    }
  }

  return roots
}
