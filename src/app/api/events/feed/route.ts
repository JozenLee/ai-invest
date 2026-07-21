import { NextRequest, NextResponse } from 'next/server'
import { eventService } from '@/lib/services/event.service'
import { prisma } from '@/lib/db/prisma'

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const category = searchParams.get('category') || undefined
    const categoryId = searchParams.get('categoryId') || undefined
    const categoryIdsParam = searchParams.get('categoryIds') || undefined
    const domainId = searchParams.get('domainId') || undefined
    const domainIdsParam = searchParams.get('domainIds') || undefined
    const sourceIdsParam = searchParams.get('sourceIds') || undefined
    const keyword = searchParams.get('keyword') || undefined
    const sentiment = searchParams.get('sentiment') || undefined
    const sentimentsParam = searchParams.get('sentiments') || undefined
    const sortBy = searchParams.get('sortBy') || 'publishTime'
    const limit = parseInt(searchParams.get('limit') || '20')
    const offset = parseInt(searchParams.get('offset') || '0')

    // 处理多个分类ID（支持逗号分隔的多选）
    let categoryIds: string[] | undefined

    if (categoryIdsParam) {
      // 多选逻辑：只使用用户选择的分类ID，不展开子分类
      // 因为当前分类体系是平级的，不存在父子关系
      categoryIds = categoryIdsParam.split(',').filter(Boolean)
    } else if (categoryId) {
      // 兼容旧的单选逻辑
      categoryIds = [categoryId]
    }

    // 处理多个领域ID（支持逗号分隔的多选）
    let domainIds: string[] | undefined
    if (domainIdsParam) {
      domainIds = domainIdsParam.split(',').filter(Boolean)
    } else if (domainId) {
      domainIds = [domainId]
    }

    // 处理多个数据源ID（支持逗号分隔的多选）
    let sourceIds: string[] | undefined
    if (sourceIdsParam) {
      sourceIds = sourceIdsParam.split(',').filter(Boolean)
    }

    // 处理多个情感筛选（支持逗号分隔的多选）
    let sentiments: string[] | undefined
    if (sentimentsParam) {
      sentiments = sentimentsParam.split(',').filter(Boolean)
    } else if (sentiment) {
      sentiments = [sentiment]
    }

    const result = await eventService.getNewsFeed({
      category,
      categoryIds,
      domainIds,
      sourceIds,
      keyword,
      sentiments,
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
