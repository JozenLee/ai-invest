import { PrismaClient } from '@prisma/client'
import { PrismaBetterSqlite3 } from '@prisma/adapter-better-sqlite3'

const adapter = new PrismaBetterSqlite3({
  url: process.env.DATABASE_URL || 'file:./prisma/dev.db',
})

const prisma = new PrismaClient({
  adapter,
})

interface MetadataWithETFs {
  trackingETFs?: Array<{
    code?: string
    ticker?: string
    name: string
    weight?: number
  }>
}

async function migrateETFBindings() {
  console.log('开始迁移 ETF 绑定数据...\n')

  const nodes = await prisma.graphNode.findMany({
    where: {
      metadata: { not: null }
    }
  })

  console.log(`找到 ${nodes.length} 个有metadata的节点\n`)

  let migratedNodeCount = 0
  let totalETFCount = 0
  let errorCount = 0

  for (const node of nodes) {
    if (!node.metadata) continue

    try {
      const metadata: MetadataWithETFs = JSON.parse(node.metadata)

      if (!metadata.trackingETFs || !Array.isArray(metadata.trackingETFs)) {
        continue
      }

      const etfCount = metadata.trackingETFs.length

      for (const etf of metadata.trackingETFs) {
        const etfCode = etf.code || etf.ticker

        if (!etfCode) {
          console.log(`  ⚠ 跳过无效ETF: ${JSON.stringify(etf)}`)
          continue
        }

        // 检查是否已存在
        const existing = await prisma.graphNodeETF.findUnique({
          where: {
            nodeId_etfCode: {
              nodeId: node.id,
              etfCode: etfCode
            }
          }
        })

        if (existing) {
          continue
        }

        // 创建绑定
        await prisma.graphNodeETF.create({
          data: {
            nodeId: node.id,
            etfCode: etfCode,
            etfName: etf.name,
            bindType: 'tracking',
            weight: etf.weight || 1.0,
            isActive: true
          }
        })
      }

      console.log(`✓ ${node.name}: ${etfCount} 个ETF`)
      migratedNodeCount++
      totalETFCount += etfCount

    } catch (error) {
      console.error(`✗ 迁移失败: ${node.name}`, error)
      errorCount++
    }
  }

  console.log(`\n迁移完成！`)
  console.log(`  成功节点: ${migratedNodeCount}`)
  console.log(`  ETF总数: ${totalETFCount}`)
  console.log(`  失败: ${errorCount}`)
}

migrateETFBindings()
  .catch(console.error)
  .finally(() => prisma.$disconnect())
