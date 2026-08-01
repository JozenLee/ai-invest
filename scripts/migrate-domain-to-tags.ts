import { PrismaClient } from '@prisma/client'
import { PrismaBetterSqlite3 } from '@prisma/adapter-better-sqlite3'
import path from 'path'

const dbPath = path.resolve(__dirname, '../prisma/dev.db')
const adapter = new PrismaBetterSqlite3({
  url: `file:${dbPath}`,
})
const prisma = new PrismaClient({ adapter })

async function migrateDomainToTags() {
  console.log('开始迁移 Domain → Tag...\n')

  const domains = await prisma.domain.findMany({
    orderBy: { createdAt: 'asc' }
  })

  console.log(`找到 ${domains.length} 个领域\n`)

  let migratedCount = 0
  let skippedCount = 0

  for (const domain of domains) {
    try {
      // 检查是否已经迁移
      const existingTag = await prisma.tag.findUnique({
        where: { code: domain.code }
      })

      if (existingTag) {
        console.log(`⊙ 跳过: ${domain.name} (已存在)`)
        skippedCount++

        // 确保桥接关系存在
        await prisma.domainTag.upsert({
          where: {
            domainId_tagId: {
              domainId: domain.id,
              tagId: existingTag.id
            }
          },
          create: {
            domainId: domain.id,
            tagId: existingTag.id
          },
          update: {}
        })

        continue
      }

      // 创建一级标签
      const tag = await prisma.tag.create({
        data: {
          name: domain.name,
          code: domain.code,
          type: 'domain',
          level: 1,
          keywords: domain.keywords,
          description: domain.description,
          isActive: domain.isActive,
          sortOrder: migratedCount
        }
      })

      // 建立桥接关系
      await prisma.domainTag.create({
        data: {
          domainId: domain.id,
          tagId: tag.id
        }
      })

      console.log(`✓ 迁移: ${domain.name} → Tag(${tag.id})`)
      migratedCount++

    } catch (error) {
      console.error(`✗ 迁移失败: ${domain.name}`, error)
    }
  }

  console.log(`\n迁移完成！`)
  console.log(`  新建: ${migratedCount} 个标签`)
  console.log(`  跳过: ${skippedCount} 个已存在`)
}

migrateDomainToTags()
  .catch(console.error)
  .finally(() => prisma.$disconnect())
