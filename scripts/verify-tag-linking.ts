#!/usr/bin/env tsx
/**
 * Verification script for NewsArticleTag linking
 * Tests that segmentCodes automatically create NewsArticleTag relationships
 */

import { prisma } from '../src/lib/db/prisma'

async function verifyTagLinking() {
  console.log('🔍 Verifying NewsArticleTag linking functionality...\n')

  try {
    // 1. Find articles with segmentCodes
    const articlesWithSegments = await prisma.newsArticle.findMany({
      where: {
        segmentCodes: { not: null },
        aiProcessed: true,
      },
      take: 10,
      include: {
        tags: {
          include: {
            tag: true,
          },
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
    })

    console.log(`📊 Found ${articlesWithSegments.length} articles with segmentCodes\n`)

    if (articlesWithSegments.length === 0) {
      console.log('⚠️  No articles with segmentCodes found in database')
      console.log('   Run the news pipeline first to generate test data')
      return
    }

    // 2. Check each article
    let totalArticles = 0
    let articlesWithTags = 0
    let articlesMissingTags = 0
    let totalSegmentCodes = 0
    let totalTagsLinked = 0

    for (const article of articlesWithSegments) {
      totalArticles++

      let segmentCodes: string[] = []
      try {
        if (article.segmentCodes) {
          segmentCodes = JSON.parse(article.segmentCodes as string)
        }
      } catch (e) {
        console.error(`❌ Failed to parse segmentCodes for article ${article.id}`)
        continue
      }

      const tagCount = article.tags.length
      totalSegmentCodes += segmentCodes.length
      totalTagsLinked += tagCount

      if (tagCount > 0) {
        articlesWithTags++
        console.log(`✅ Article ${article.id.substring(0, 8)}...`)
        console.log(`   Title: ${article.title.substring(0, 60)}...`)
        console.log(`   SegmentCodes (${segmentCodes.length}): ${segmentCodes.join(', ')}`)
        console.log(`   Linked Tags (${tagCount}): ${article.tags.map(t => t.tag.code).join(', ')}`)

        // Check if counts match
        if (tagCount !== segmentCodes.length) {
          console.log(`   ⚠️  Mismatch: ${segmentCodes.length} codes but ${tagCount} tags`)
        }
      } else {
        articlesMissingTags++
        console.log(`❌ Article ${article.id.substring(0, 8)}...`)
        console.log(`   Title: ${article.title.substring(0, 60)}...`)
        console.log(`   SegmentCodes (${segmentCodes.length}): ${segmentCodes.join(', ')}`)
        console.log(`   Linked Tags: NONE (should have ${segmentCodes.length})`)
      }
      console.log('')
    }

    // 3. Summary
    console.log('\n📈 Summary:')
    console.log(`   Total articles checked: ${totalArticles}`)
    console.log(`   Articles with tags linked: ${articlesWithTags}`)
    console.log(`   Articles missing tags: ${articlesMissingTags}`)
    console.log(`   Total segmentCodes: ${totalSegmentCodes}`)
    console.log(`   Total tags linked: ${totalTagsLinked}`)

    if (totalSegmentCodes > 0) {
      const linkingRate = (totalTagsLinked / totalSegmentCodes * 100).toFixed(1)
      console.log(`   Linking rate: ${linkingRate}%`)
    }

    // 4. Check Tag table
    const segmentTags = await prisma.tag.findMany({
      where: {
        type: 'segment',
      },
    })

    console.log(`\n🏷️  Total segment tags in database: ${segmentTags.length}`)

    // 5. Overall result
    if (articlesMissingTags === 0 && articlesWithTags > 0) {
      console.log('\n✅ SUCCESS: All articles have proper tag linking!')
    } else if (articlesMissingTags > 0) {
      console.log('\n⚠️  WARNING: Some articles are missing tag links')
      console.log('   This may indicate the fix needs to be applied to existing data')
      console.log('   New articles should link correctly after the fix')
    } else {
      console.log('\n⚠️  No data to verify. Run news pipeline to generate test data.')
    }

  } catch (error) {
    console.error('❌ Verification failed:', error)
  } finally {
    await prisma.$disconnect()
  }
}

// Run verification
verifyTagLinking()
