import { PrismaClient } from '@prisma/client'
import { PrismaBetterSqlite3 } from '@prisma/adapter-better-sqlite3'

const adapter = new PrismaBetterSqlite3({
  url: process.env.DATABASE_URL || 'file:./prisma/dev.db',
})

const prisma = new PrismaClient({
  adapter,
})

interface NodeStats {
  newsCount: number
  recentNewsCount: number  // 最近30天
  avgSentiment: number
  lastNewsDate: Date | null
}

async function recalculateNodeStats() {
  console.log('开始重新计算节点统计数据...\n')

  const nodes = await prisma.graphNode.findMany({
    select: {
      id: true,
      name: true,
      metadata: true
    }
  })

  console.log(`找到 ${nodes.length} 个节点\n`)

  let updated = 0
  let skipped = 0

  const thirtyDaysAgo = new Date()
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)

  for (const node of nodes) {
    try {
      // 查询关联的新闻
      const newsLinks = await prisma.newsGraphLink.findMany({
        where: { nodeId: node.id },
        include: {
          news: {
            select: {
              publishTime: true,
              createdAt: true
            }
          }
        }
      })

      const newsCount = newsLinks.length

      // 最近30天新闻数
      const recentNewsCount = newsLinks.filter(link => {
        const date = link.news.publishTime || link.news.createdAt
        return date >= thirtyDaysAgo
      }).length

      // 计算平均情感（需要从新闻分析结果获取，这里简化为0）
      const avgSentiment = 0

      // 最新新闻日期
      const latestNews = newsLinks
        .map(link => link.news.publishTime || link.news.createdAt)
        .sort((a, b) => b.getTime() - a.getTime())[0] || null

      // 更新节点metadata
      const currentMetadata = node.metadata ? JSON.parse(node.metadata as string) : {}
      const updatedMetadata = {
        ...currentMetadata,
        stats: {
          newsCount,
          recentNewsCount,
          avgSentiment,
          lastNewsDate: latestNews?.toISOString(),
          updatedAt: new Date().toISOString()
        }
      }

      await prisma.graphNode.update({
        where: { id: node.id },
        data: {
          metadata: JSON.stringify(updatedMetadata)
        }
      })

      if (newsCount > 0) {
        console.log(`✓ ${node.name}: ${newsCount} 篇新闻 (最近30天: ${recentNewsCount})`)
        updated++
      } else {
        console.log(`○ ${node.name}: 无关联新闻`)
        skipped++
      }

    } catch (error) {
      console.error(`✗ 处理失败: ${node.name}`, error)
    }
  }

  console.log(`\n重算完成！`)
  console.log(`  更新: ${updated}`)
  console.log(`  跳过: ${skipped}`)
}

recalculateNodeStats()
  .catch(console.error)
  .finally(() => prisma.$disconnect())
