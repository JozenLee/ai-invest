import { PrismaClient } from '@prisma/client'
import { PrismaBetterSqlite3 } from '@prisma/adapter-better-sqlite3'

const adapter = new PrismaBetterSqlite3({
  url: process.env.DATABASE_URL || 'file:./prisma/dev.db',
})

const prisma = new PrismaClient({
  adapter,
})

async function main() {
  console.log('当前数据源列表：\n')

  const dataSources = await prisma.dataSource.findMany({
    orderBy: { createdAt: 'asc' }
  })

  console.log('总数:', dataSources.length)
  console.log('\n详细列表：')
  console.log('=' .repeat(100))

  dataSources.forEach((ds, idx) => {
    console.log(`${idx + 1}. ${ds.name}`)
    console.log(`   ID: ${ds.id}`)
    console.log(`   类型: ${ds.type} | Provider: ${ds.provider} | 驱动: ${ds.driverType}`)
    console.log(`   分类: ${ds.category}`)
    console.log(`   配置: ${ds.config}`)
    console.log(`   更新频率: ${ds.updateFrequency}分钟 | 激活: ${ds.isActive}`)
    console.log(`   最后采集: ${ds.lastFetchAt || '未采集'} | 状态: ${ds.lastFetchStatus || 'N/A'}`)
    console.log('=' .repeat(100))
  })
}

main()
  .catch((e) => {
    console.error('查询失败:', e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
