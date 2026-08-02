import { PrismaClient } from '@prisma/client'
import { PrismaBetterSqlite3 } from '@prisma/adapter-better-sqlite3'
import { newsAnalysisService } from '../src/lib/ai/news-analysis.service'
import { prisma as dbPrisma } from '../src/lib/db/prisma'

const adapter = new PrismaBetterSqlite3({
  url: process.env.DATABASE_URL || 'file:./prisma/dev.db',
})

const prisma = new PrismaClient({
  adapter,
})

interface BatchOptions {
  batchSize?: number
  delayMs?: number
  skipExisting?: boolean
}

async function batchTagHistoricalNews(options: BatchOptions = {}) {
  const {
    batchSize = 10,
    delayMs = 1000,
    skipExisting = true
  } = options

  console.log('开始批量处理历史新闻...\n')
  console.log(`配置: batchSize=${batchSize}, delay=${delayMs}ms, skipExisting=${skipExisting}\n`)

  // 查询需要处理的新闻
  const whereClause = skipExisting
    ? { tags: { none: {} } }  // 只处理没有标签的新闻
    : {}

  const totalNews = await prisma.newsArticle.count({ where: whereClause })
  console.log(`找到 ${totalNews} 篇待处理新闻\n`)

  let processed = 0
  let failed = 0
  let skipped = 0

  // 分批处理
  for (let offset = 0; offset < totalNews; offset += batchSize) {
    const batch = await prisma.newsArticle.findMany({
      where: whereClause,
      take: batchSize,
      skip: offset,
      select: {
        id: true,
        title: true,
        content: true,
        summary: true
      }
    })

    console.log(`\n处理批次 ${Math.floor(offset / batchSize) + 1}/${Math.ceil(totalNews / batchSize)}...`)

    for (const news of batch) {
      try {
        // 检查API密钥
        if (!process.env.ANTHROPIC_API_KEY) {
          console.log('  ⚠ 跳过AI分析（未配置ANTHROPIC_API_KEY）')
          skipped++
          continue
        }

        // 使用AI分析
        const analysis = await newsAnalysisService.analyzeNewsWithTags(
          news.title,
          news.content || news.summary || ''
        )

        // 保存标签关联
        if (analysis.tags.length > 0) {
          await prisma.newsArticle.update({
            where: { id: news.id },
            data: {
              tags: {
                create: analysis.tags.map(tag => ({
                  tagId: tag.tagId,
                  confidence: tag.confidence
                }))
              }
            }
          })

          console.log(`  ✓ ${news.title.substring(0, 40)}... (${analysis.tags.length} 个标签)`)
          processed++
        } else {
          console.log(`  ○ ${news.title.substring(0, 40)}... (无标签)`)
          skipped++
        }

        // 保存节点关联
        if (analysis.relatedNodes.length > 0) {
          await prisma.newsGraphLink.createMany({
            data: analysis.relatedNodes.map(node => ({
              newsId: news.id,
              nodeId: node.nodeId,
              relevance: node.relevance,
              sentiment: analysis.sentimentLabel || 'neutral',
              impactType: 'direct'
            }))
          })
        }

        // 延迟避免API限流
        await new Promise(resolve => setTimeout(resolve, delayMs))

      } catch (error) {
        console.error(`  ✗ 处理失败: ${news.title.substring(0, 40)}...`, error)
        failed++
      }
    }
  }

  console.log(`\n批量处理完成！`)
  console.log(`  成功: ${processed}`)
  console.log(`  跳过: ${skipped}`)
  console.log(`  失败: ${failed}`)
}

// 从命令行参数获取配置
const args = process.argv.slice(2)
const batchSize = args.includes('--batch-size')
  ? parseInt(args[args.indexOf('--batch-size') + 1])
  : 10
const delayMs = args.includes('--delay')
  ? parseInt(args[args.indexOf('--delay') + 1])
  : 1000
const skipExisting = !args.includes('--reprocess')

batchTagHistoricalNews({ batchSize, delayMs, skipExisting })
  .catch(console.error)
  .finally(() => prisma.$disconnect())
