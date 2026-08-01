import { NextRequest, NextResponse } from 'next/server'
import { tagService } from '@/lib/services/tag.service'

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams
    const type = searchParams.get('type')
    const level = searchParams.get('level')
    const parentId = searchParams.get('parentId')

    // 如果没有筛选条件，返回树形结构
    if (!type && !level && !parentId) {
      const tree = await tagService.getTagTree()
      return NextResponse.json({
        success: true,
        data: tree
      })
    }

    // 否则返回平铺列表（可以根据需要扩展）
    const tree = await tagService.getTagTree()
    return NextResponse.json({
      success: true,
      data: tree
    })

  } catch (error) {
    console.error('Failed to get tags:', error)
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to get tags'
      },
      { status: 500 }
    )
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()

    const tag = await tagService.createTag({
      name: body.name,
      code: body.code,
      type: body.type,
      level: body.level,
      parentId: body.parentId,
      description: body.description,
      keywords: body.keywords,
      sortOrder: body.sortOrder
    })

    return NextResponse.json({
      success: true,
      data: tag
    })

  } catch (error) {
    console.error('Failed to create tag:', error)
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to create tag'
      },
      { status: 400 }
    )
  }
}
