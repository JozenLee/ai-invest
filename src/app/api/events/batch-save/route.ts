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
        // 保存文章
        const savedArticle = await prisma.newsArticle.upsert({
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
            domainIds: article.domainIds,
            segmentCodes: article.segmentCodes,
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
            domainIds: article.domainIds,
            segmentCodes: article.segmentCodes,
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

        // 同步 segmentCodes 到 NewsArticleTag 表
        if (article.segmentCodes) {
          try {
            // 解析 segmentCodes（可能是 JSON 字符串或数组）
            let segmentCodes: string[] = []

            if (typeof article.segmentCodes === 'string') {
              // 处理空字符串、"null" 字符串或 "[]"
              if (article.segmentCodes && article.segmentCodes !== 'null' && article.segmentCodes !== '[]') {
                try {
                  segmentCodes = JSON.parse(article.segmentCodes)
                } catch (parseError) {
                  console.error(`Failed to parse segmentCodes for article ${savedArticle.id}:`, parseError)
                }
              }
            } else if (Array.isArray(article.segmentCodes)) {
              segmentCodes = article.segmentCodes
            }

            if (Array.isArray(segmentCodes) && segmentCodes.length > 0) {
              // 使用事务确保原子性：要么全部成功，要么全部回滚
              await prisma.$transaction(async (tx) => {
                // 删除旧的标签关联
                await tx.newsArticleTag.deleteMany({
                  where: { newsId: savedArticle.id }
                })

                // 为每个 segmentCode 查找或创建对应的 Tag，并建立关联
                for (const segmentCode of segmentCodes) {
                  // 过滤无效的 segmentCode
                  if (!segmentCode ||
                      typeof segmentCode !== 'string' ||
                      segmentCode.trim() === '' ||
                      segmentCode === 'irrelevant') {
                    continue
                  }

                  const cleanCode = segmentCode.trim()

                  // 查找或创建 Tag（自动创建确保不会丢失分类信息）
                  const tag = await tx.tag.upsert({
                    where: { code: cleanCode },
                    update: {
                      // 标签存在时，仅更新时间戳
                      updatedAt: new Date(),
                    },
                    create: {
                      name: cleanCode,
                      code: cleanCode,
                      type: 'segment', // segment 类型标签
                      level: 2,
                      isActive: true,
                    },
                  })

                  // 创建 NewsArticleTag 关联（使用 upsert 防止重复）
                  await tx.newsArticleTag.upsert({
                    where: {
                      newsId_tagId: {
                        newsId: savedArticle.id,
                        tagId: tag.id,
                      },
                    },
                    update: {
                      confidence: article.categoryConfidence || 1.0,
                    },
                    create: {
                      newsId: savedArticle.id,
                      tagId: tag.id,
                      confidence: article.categoryConfidence || 1.0,
                    },
                  })
                }
              })

              console.log(`✅ Synced ${segmentCodes.length} segment tags for article ${savedArticle.id}`)
            }
          } catch (tagError) {
            console.error(`❌ Failed to sync tags for article ${savedArticle.id}:`, tagError)
            // 标签同步失败不影响文章保存
          }
        }

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
