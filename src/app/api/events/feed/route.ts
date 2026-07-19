import { NextRequest, NextResponse } from 'next/server'
import { eventService } from '@/lib/services/event.service'
import { prisma } from '@/lib/db/prisma'

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const category = searchParams.get('category') || undefined
    const categoryId = searchParams.get('categoryId') || undefined
    const domainId = searchParams.get('domainId') || undefined
    const keyword = searchParams.get('keyword') || undefined
    const sentiment = searchParams.get('sentiment') || undefined
    const sortBy = searchParams.get('sortBy') || 'publishTime'
    const limit = parseInt(searchParams.get('limit') || '20')
    const offset = parseInt(searchParams.get('offset') || '0')

    // 如果指定了categoryId，获取该分类及其子分类的文章
    let categoryIds: string[] | undefined
    if (categoryId) {
      const category = await prisma.newsCategory.findUnique({
        where: { id: categoryId },
        include: { children: true },
      })
      if (category) {
        categoryIds = [categoryId, ...category.children.map((c) => c.id)]
      }
    }

    const result = await eventService.getNewsFeed({
      category,
      categoryIds,
      domainId,
      keyword,
      sentiment,
      sortBy,
      limit,
      offset,
    })

    return NextResponse.json({
      success: true,
      data: result,
    })
  } catch (error) {
    console.error('获取新闻失败:', error)
    return NextResponse.json(
      {
        success: false,
        error: '无法获取新闻数据，请确认数据服务已启动',
        data: null,
      },
      { status: 500 }
    )
  }
}
