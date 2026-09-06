import newsSourceCatalog from '../config/news-sources.json'
import { PrismaClient } from '@prisma/client'
import { PrismaBetterSqlite3 } from '@prisma/adapter-better-sqlite3'

const adapter = new PrismaBetterSqlite3({
  url: process.env.DATABASE_URL || 'file:./prisma/dev.db',
})

const prisma = new PrismaClient({ adapter })

async function main() {
  console.log('开始添加数据源种子数据...')

  // 与数据服务启动使用同一份清理后的有效目录。
  const dataSources = newsSourceCatalog.map(({ enabled, config, ...source }) => ({ ...source, config: JSON.stringify(config), isActive: enabled }))

  // 创建或更新数据源
  for (const source of dataSources) {
    await prisma.dataSource.upsert({
      where: { id: source.id },
      update: {},
      create: source,
    })
    console.log(`✅ 数据源创建: ${source.name} (${source.category})`)
  }

  console.log('\n开始创建调度任务...')

  // 为每个数据源创建对应的SchedulerJob
  for (const source of dataSources) {
    if (await prisma.schedulerJob.findFirst({ where: { sourceId: source.id } })) continue
    const jobId = `job_${source.id}`

    await prisma.schedulerJob.upsert({
      where: { id: jobId },
      update: {},
      create: {
        id: jobId,
        sourceId: source.id,
        scheduleType: 'interval',
        scheduleConfig: JSON.stringify({
          intervalMinutes: source.updateFrequency,
          timezone: 'Asia/Shanghai'
        }),
        isEnabled: true,
        nextRunAt: new Date(), // 立即可执行
      },
    })
    console.log(`✅ 调度任务创建: ${source.name} (每${source.updateFrequency}分钟)`)
  }

  console.log('\n✨ 数据源种子数据添加完成！')
  console.log(`📊 总计: ${dataSources.length}个数据源, ${dataSources.length}个调度任务`)

  // 统计各类别数量
  const categoryStats = dataSources.reduce((acc, source) => {
    acc[source.category] = (acc[source.category] || 0) + 1
    return acc
  }, {} as Record<string, number>)

  console.log('\n📋 分类统计:')
  Object.entries(categoryStats).forEach(([category, count]) => {
    console.log(`   - ${category}: ${count}个`)
  })
}

main()
  .catch((e) => {
    console.error('❌ 添加数据源种子数据失败:', e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
