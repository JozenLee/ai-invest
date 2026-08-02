import { NextRequest, NextResponse } from 'next/server'
import { newsGraphLinkerService } from '@/lib/services/news-graph-linker.service'

/**
 * POST /api/news/[id]/link-graph
 * 手动触发新闻与图谱关联
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: newsId } = await params

    if (!newsId) {
      return NextResponse.json(
        { success: false, error: '缺少新闻ID' },
        { status: 400 }
      )
    }

    const result = await newsGraphLinkerService.linkNewsToGraph(newsId)

    return NextResponse.json({
      success: true,
      data: {
        newsId: result.newsId,
        matchCount: result.matches.length,
        matches: result.matches,
        tokensUsed: result.tokensUsed,
        durationMs: result.durationMs
      }
    })
  } catch (error) {
    console.error('Link news to graph error:', error)
    return NextResponse.json(
      { success: false, error: String(error) },
      { status: 500 }
    )
  }
}
