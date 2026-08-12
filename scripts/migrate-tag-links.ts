#!/usr/bin/env tsx
/**
 * Migration script to fix missing NewsArticleTag relationships
 * Scans all existing articles with segmentCodes and creates missing tag links
 */

import { prisma } from '../src/lib/db/prisma'

async function migrateExistingArticles() {
  console.log('🔧 Starting migration to fix missing NewsArticleTag relationships...\n')

  try {
    // Find all articles with segmentCodes
    const articles = await prisma.newsArticle.findMany({
      where: {
        segmentCodes: { not: null },
      },
      include: {
        tags: true,
      },
    })

    console.log(`📊 Found ${articles.length} articles with segmentCodes\n`)

    let processedCount = 0
    let fixedCount = 0
    let skippedCount = 0
    let errorCount = 0
    let totalTagsCreated = 0

    for (const article of articles) {
      processedCount++

      try {
        // Parse segmentCodes
        let segmentCodes: string[] = []
        try {
          if (article.segmentCodes) {
            segmentCodes = JSON.parse(article.segmentCodes as string)
          }
        } catch (parseError) {
          console.error(`❌ Failed to parse segmentCodes for article ${article.id}`)
          errorCount++
          continue
        }

        // Filter valid segment codes
        const validSegmentCodes = segmentCodes.filter(
          code => code && typeof code === 'string' && code.trim() !== '' && code !== 'irrelevant'
        )

        if (validSegmentCodes.length === 0) {
          skippedCount++
          continue
        }

        // Check if tags are already linked
        const existingTagCodes = article.tags.map(t => t.tagId)

        // Get all tags for these segment codes
        const existingTags = await prisma.tag.findMany({
          where: {
            code: { in: validSegmentCodes },
          },
        })

        const existingTagMap = new Map(existingTags.map(t => [t.code, t.id]))
        const linkedTagIds = new Set(existingTagCodes)

        let needsFix = false
        let tagsCreated = 0

        // Use transaction for atomic operation
        await prisma.$transaction(async (tx) => {
          for (const segmentCode of validSegmentCodes) {
            const cleanCode = segmentCode.trim()

            // Create tag if it doesn't exist
            const tag = await tx.tag.upsert({
              where: { code: cleanCode },
              update: {
                updatedAt: new Date(),
              },
              create: {
                name: cleanCode,
                code: cleanCode,
                type: 'segment',
                level: 2,
                isActive: true,
              },
            })

            // Create NewsArticleTag if not already linked
            if (!linkedTagIds.has(tag.id)) {
              await tx.newsArticleTag.create({
                data: {
                  newsId: article.id,
                  tagId: tag.id,
                  confidence: article.categoryConfidence || 1.0,
                },
              })
              needsFix = true
              tagsCreated++
            }
          }
        })

        if (needsFix) {
          fixedCount++
          totalTagsCreated += tagsCreated
          console.log(`✅ Fixed article ${article.id.substring(0, 8)}... - created ${tagsCreated} tag links`)
        } else {
          skippedCount++
        }

      } catch (error) {
        errorCount++
        console.error(`❌ Error processing article ${article.id}:`, error)
      }

      // Progress indicator
      if (processedCount % 10 === 0) {
        console.log(`   Progress: ${processedCount}/${articles.length} articles processed...`)
      }
    }

    // Summary
    console.log('\n📈 Migration Summary:')
    console.log(`   Total articles processed: ${processedCount}`)
    console.log(`   Articles fixed: ${fixedCount}`)
    console.log(`   Articles skipped (already linked): ${skippedCount}`)
    console.log(`   Articles with errors: ${errorCount}`)
    console.log(`   Total tag links created: ${totalTagsCreated}`)

    if (fixedCount > 0) {
      console.log('\n✅ Migration completed successfully!')
    } else if (errorCount === 0) {
      console.log('\n✅ No articles needed fixing - all tag links are correct!')
    } else {
      console.log('\n⚠️  Migration completed with some errors')
    }

  } catch (error) {
    console.error('❌ Migration failed:', error)
  } finally {
    await prisma.$disconnect()
  }
}

// Run migration
migrateExistingArticles()
