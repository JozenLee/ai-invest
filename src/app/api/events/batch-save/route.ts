import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db/prisma'

export async function POST(request: NextRequest) {
  try {
    const { articles } = await request.json()

    if (!articles || !Array.isArray(articles)) {
      return NextResponse.json(
        { success: false, error: 'Invalid request body' },
        { status: 400 }
      )
    }

    let savedCount = 0
    let failedCount = 0

    // 批量处理文章
    for (const article of articles) {
      try {
        await prisma.newsArticle.upsert({
          where: {
            url: article.url || `fallback_${article.id}`
          },
          update: {
            title: article.title,
            content: article.content,
            summary: article.summary,
            source: article.source,
            categoryId: article.categoryId,
            categoryConfidence: article.categoryConfidence,
            domainId: article.domainId,
            sentiment: article.sentiment,
            sentimentLabel: article.sentimentLabel,
            sentimentConfidence: article.sentimentConfidence,
            impact: article.impact,
            keywords: article.keywords,
            entities: article.entities,
            sectors: article.sectors,
            aiProcessed: article.aiProcessed,
            aiProcessedAt: article.aiProcessedAt ? new Date(article.aiProcessedAt) : null,
            aiError: article.aiError,
          },
          create: {
            title: article.title,
            content: article.content,
            summary: article.summary,
            source: article.source,
            url: article.url,
            publishTime: new Date(article.publishTime),
            category: article.categoryId || 'market',
            categoryId: article.categoryId,
            categoryConfidence: article.categoryConfidence,
            domainId: article.domainId,
            sentiment: article.sentiment,
            sentimentLabel: article.sentimentLabel,
            sentimentConfidence: article.sentimentConfidence,
            impact: article.impact,
            keywords: article.keywords,
            entities: article.entities,
            sectors: article.sectors,
            aiProcessed: article.aiProcessed,
            aiProcessedAt: article.aiProcessedAt ? new Date(article.aiProcessedAt) : null,
            aiError: article.aiError,
          },
        })
        savedCount++
      } catch (error) {
        console.error(`Failed to save article ${article.id}:`, error)
        failedCount++
      }
    }

    return NextResponse.json({
      success: true,
      data: {
        saved: savedCount,
        failed: failedCount,
        total: articles.length,
      },
    })
  } catch (error) {
    console.error('Batch save error:', error)
    return NextResponse.json(
      { success: false, error: 'Failed to save articles' },
      { status: 500 }
    )
  }
}
