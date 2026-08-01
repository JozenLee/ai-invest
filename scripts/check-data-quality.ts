import { PrismaClient } from '@prisma/client'
import { PrismaBetterSqlite3 } from '@prisma/adapter-better-sqlite3'

const adapter = new PrismaBetterSqlite3({
  url: process.env.DATABASE_URL || 'file:./prisma/dev.db',
})

const prisma = new PrismaClient({
  adapter,
})

interface QualityReport {
  timestamp: string
  tags: {
    total: number
    active: number
    inactive: number
    orphaned: number
    withoutChildren: number
  }
  newsArticleTags: {
    total: number
    uniqueNews: number
    uniqueTags: number
    avgTagsPerNews: number
    lowConfidence: number
  }
  graphNodeTags: {
    total: number
    uniqueNodes: number
    uniqueTags: number
    avgTagsPerNode: number
  }
  graphNodeETF: {
    total: number
    active: number
    inactive: number
    uniqueNodes: number
    uniqueETFs: number
    avgETFsPerNode: number
  }
  domainTags: {
    total: number
    orphanedDomains: number
    orphanedTags: number
  }
}

async function checkDataQuality(): Promise<QualityReport> {
  console.log('开始数据质量检查...\n')

  // 检查Tag
  console.log('检查 Tag...')
  const totalTags = await prisma.tag.count()
  const activeTags = await prisma.tag.count({ where: { isActive: true } })
  const inactiveTags = totalTags - activeTags

  const orphanedTags = await prisma.tag.count({
    where: {
      parentId: { not: null },
      parent: null
    }
  })

  const tagsWithoutChildren = await prisma.tag.count({
    where: {
      children: { none: {} },
      level: { lt: 4 }
    }
  })

  console.log(`  总计: ${totalTags}`)
  console.log(`  活跃: ${activeTags}`)
  console.log(`  停用: ${inactiveTags}`)
  console.log(`  孤立标签: ${orphanedTags}`)
  console.log(`  无子节点的非叶子标签: ${tagsWithoutChildren}`)

  // 检查NewsArticleTag
  console.log('\n检查 NewsArticleTag...')
  const totalNewsArticleTags = await prisma.newsArticleTag.count()
  const uniqueNews = await prisma.newsArticleTag.groupBy({
    by: ['newsId']
  })
  const uniqueTagsInNews = await prisma.newsArticleTag.groupBy({
    by: ['tagId']
  })
  const avgTagsPerNews = uniqueNews.length > 0
    ? totalNewsArticleTags / uniqueNews.length
    : 0
  const lowConfidenceCount = await prisma.newsArticleTag.count({
    where: { confidence: { lt: 0.5 } }
  })

  console.log(`  总关联: ${totalNewsArticleTags}`)
  console.log(`  已标记新闻数: ${uniqueNews.length}`)
  console.log(`  使用的标签数: ${uniqueTagsInNews.length}`)
  console.log(`  平均每篇新闻标签数: ${avgTagsPerNews.toFixed(2)}`)
  console.log(`  低置信度(<0.5): ${lowConfidenceCount}`)

  // 检查GraphNodeTag
  console.log('\n检查 GraphNodeTag...')
  const totalGraphNodeTags = await prisma.graphNodeTag.count()
  const uniqueNodes = await prisma.graphNodeTag.groupBy({
    by: ['nodeId']
  })
  const uniqueTagsInNodes = await prisma.graphNodeTag.groupBy({
    by: ['tagId']
  })
  const avgTagsPerNode = uniqueNodes.length > 0
    ? totalGraphNodeTags / uniqueNodes.length
    : 0

  console.log(`  总关联: ${totalGraphNodeTags}`)
  console.log(`  已标记节点数: ${uniqueNodes.length}`)
  console.log(`  使用的标签数: ${uniqueTagsInNodes.length}`)
  console.log(`  平均每个节点标签数: ${avgTagsPerNode.toFixed(2)}`)

  // 检查GraphNodeETF
  console.log('\n检查 GraphNodeETF...')
  const totalETFBindings = await prisma.graphNodeETF.count()
  const activeETFBindings = await prisma.graphNodeETF.count({
    where: { isActive: true }
  })
  const inactiveETFBindings = totalETFBindings - activeETFBindings
  const uniqueNodesWithETF = await prisma.graphNodeETF.groupBy({
    by: ['nodeId']
  })
  const uniqueETFs = await prisma.graphNodeETF.groupBy({
    by: ['etfCode']
  })
  const avgETFsPerNode = uniqueNodesWithETF.length > 0
    ? activeETFBindings / uniqueNodesWithETF.length
    : 0

  console.log(`  总绑定: ${totalETFBindings}`)
  console.log(`  活跃: ${activeETFBindings}`)
  console.log(`  停用: ${inactiveETFBindings}`)
  console.log(`  绑定节点数: ${uniqueNodesWithETF.length}`)
  console.log(`  不同ETF数: ${uniqueETFs.length}`)
  console.log(`  平均每节点ETF数: ${avgETFsPerNode.toFixed(2)}`)

  // 检查DomainTag
  console.log('\n检查 DomainTag...')
  const totalDomainTags = await prisma.domainTag.count()

  // 找出孤立的Domain（有桥接但Tag不存在）
  const orphanedDomains = await prisma.$queryRaw<Array<{ count: number }>>`
    SELECT COUNT(*) as count FROM DomainTag dt
    LEFT JOIN Tag t ON dt.tagId = t.id
    WHERE t.id IS NULL
  `

  // 找出孤立的Tag（有桥接但Domain不存在）
  const orphanedTagsInBridge = await prisma.$queryRaw<Array<{ count: number }>>`
    SELECT COUNT(*) as count FROM DomainTag dt
    LEFT JOIN Domain d ON dt.domainId = d.id
    WHERE d.id IS NULL
  `

  console.log(`  总桥接: ${totalDomainTags}`)
  console.log(`  孤立Domain: ${orphanedDomains[0]?.count || 0}`)
  console.log(`  孤立Tag: ${orphanedTagsInBridge[0]?.count || 0}`)

  const report: QualityReport = {
    timestamp: new Date().toISOString(),
    tags: {
      total: totalTags,
      active: activeTags,
      inactive: inactiveTags,
      orphaned: orphanedTags,
      withoutChildren: tagsWithoutChildren
    },
    newsArticleTags: {
      total: totalNewsArticleTags,
      uniqueNews: uniqueNews.length,
      uniqueTags: uniqueTagsInNews.length,
      avgTagsPerNews,
      lowConfidence: lowConfidenceCount
    },
    graphNodeTags: {
      total: totalGraphNodeTags,
      uniqueNodes: uniqueNodes.length,
      uniqueTags: uniqueTagsInNodes.length,
      avgTagsPerNode
    },
    graphNodeETF: {
      total: totalETFBindings,
      active: activeETFBindings,
      inactive: inactiveETFBindings,
      uniqueNodes: uniqueNodesWithETF.length,
      uniqueETFs: uniqueETFs.length,
      avgETFsPerNode
    },
    domainTags: {
      total: totalDomainTags,
      orphanedDomains: orphanedDomains[0]?.count || 0,
      orphanedTags: orphanedTagsInBridge[0]?.count || 0
    }
  }

  console.log('\n✓ 数据质量检查完成')
  console.log('\n完整报告:')
  console.log(JSON.stringify(report, null, 2))

  return report
}

checkDataQuality()
  .catch(console.error)
  .finally(() => prisma.$disconnect())
