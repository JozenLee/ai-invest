import { NextRequest, NextResponse } from 'next/server'
import { newsGraphLinkerService } from '@/lib/services/news-graph-linker.service'
import { prisma } from '@/lib/db'

/**
 * POST /api/news/batch-link-graph
 * 批量关联新闻到图谱（用于历史数据迁移或批量处理）
 * Body: { newsIds?: string[], unlinkedOnly?: boolean, limit?: number }
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { newsIds, unlinkedOnly = false, limit = 50 } = body

    let targetNewsIds: string[]

    if (newsIds && Array.isArray(newsIds)) {
      // 使用指定的新闻ID列表
      targetNewsIds = newsIds
    } else {
      // 查询需要关联的新闻
      const whereClause: any = {
        aiProcessed: true // 只处理已经AI分析过的新闻
      }

      if (unlinkedOnly) {
        // 只处理尚未关联的新闻
        whereClause.graphLinks = {
          none: {}
        }
      }

      const news = await prisma.newsArticle.findMany({
        where: whereClause,
        select: { id: true },
        take: limit,
        orderBy: { publishTime: 'desc' }
      })

      targetNewsIds = news.map(n => n.id)
    }

    if (targetNewsIds.length === 0) {
      return NextResponse.json({
        success: true,
        data: {
          total: 0,
          success: 0,
          failed: 0,
          message: '没有需要处理的新闻'
        }
      })
    }

    // 执行批量关联
    const result = await newsGraphLinkerService.batchLinkNews(targetNewsIds, 3)

    return NextResponse.json({
      success: true,
      data: result
    })
  } catch (error) {
    console.error('Batch link news error:', error)
    return NextResponse.json(
      { success: false, error: String(error) },
      { status: 500 }
    )
  }
}
