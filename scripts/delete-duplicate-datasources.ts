import { PrismaClient } from '@prisma/client'
import { PrismaBetterSqlite3 } from '@prisma/adapter-better-sqlite3'

const adapter = new PrismaBetterSqlite3({
  url: process.env.DATABASE_URL || 'file:./prisma/dev.db',
})

const prisma = new PrismaClient({
  adapter,
})

async function deleteDuplicateDataSources() {
  console.log('开始删除重复的数据源...\n')

  // 需要删除的重复数据源
  const duplicatesToDelete = [
    {
      id: 'ds_cls',
      name: '财联社',
      reason: '与 财联社-AKShare 和 财联社热榜-NewsNow 重复',
      keepInstead: '财联社-AKShare (AKShare API) + 财联社热榜-NewsNow (NewsNow 热榜)'
    },
    {
      id: 'ds_caixin',
      name: '财新网',
      reason: '与 财新网-AKShare 重复',
      keepInstead: '财新网-AKShare (AKShare API)'
    },
    {
      id: 'ds_36kr',
      name: '36氪',
      reason: '与 36氪-NewsNow 重复',
      keepInstead: '36氪-NewsNow (NewsNow 热榜)'
    },
  ]

  console.log('📋 待删除的重复数据源：')
  console.log('=' .repeat(100))
  duplicatesToDelete.forEach((item, idx) => {
    console.log(`${idx + 1}. ${item.name} (${item.id})`)
    console.log(`   原因: ${item.reason}`)
    console.log(`   保留: ${item.keepInstead}`)
    console.log()
  })
  console.log('=' .repeat(100))
  console.log()

  let successCount = 0
  let failCount = 0

  for (const item of duplicatesToDelete) {
    try {
      console.log(`正在删除: ${item.name} (${item.id})...`)

      // 1. 删除关联的调度任务
      const deletedJobs = await prisma.schedulerJob.deleteMany({
        where: { sourceId: item.id }
      })
      console.log(`  ✓ 删除了 ${deletedJobs.count} 个调度任务`)

      // 2. 删除关联的日志
      const deletedLogs = await prisma.dataSourceLog.deleteMany({
        where: { sourceId: item.id }
      })
      console.log(`  ✓ 删除了 ${deletedLogs.count} 条日志`)

      // 3. 将关联的文章的 sourceId 设为 null（保留文章）
      const updatedArticles = await prisma.newsArticle.updateMany({
        where: { sourceId: item.id },
        data: { sourceId: null }
      })
      console.log(`  ✓ 更新了 ${updatedArticles.count} 篇文章（sourceId 设为 null）`)

      // 4. 删除数据源本身
      await prisma.dataSource.delete({
        where: { id: item.id }
      })
      console.log(`  ✅ 成功删除数据源: ${item.name}`)
      console.log()

      successCount++
    } catch (error: any) {
      failCount++
      console.log(`  ❌ 删除失败: ${item.name} - ${error.message}`)
      console.log()
    }
  }

  console.log('=' .repeat(100))
  console.log(`删除结果: 成功 ${successCount} 个, 失败 ${failCount} 个`)
  console.log('=' .repeat(100))
  console.log()

  // 显示清理后的数据源列表
  const remaining = await prisma.dataSource.findMany({
    where: { isActive: true },
    orderBy: { name: 'asc' }
  })

  console.log('✨ 清理后的激活数据源列表：')
  console.log('=' .repeat(100))

  const grouped: Record<string, typeof remaining> = {}
  remaining.forEach(ds => {
    const key = ds.provider.toUpperCase()
    if (!grouped[key]) grouped[key] = []
    grouped[key].push(ds)
  })

  Object.entries(grouped).forEach(([provider, sources]) => {
    console.log(`\n${provider} (${sources.length}个):`)
    sources.forEach((ds, idx) => {
      console.log(`  ${idx + 1}. ${ds.name}`)
      console.log(`     ID: ${ds.id}`)
      console.log(`     类别: ${ds.category} | 频率: ${ds.updateFrequency}分钟`)
    })
  })

  const totalActive = await prisma.dataSource.count({ where: { isActive: true } })
  const totalInactive = await prisma.dataSource.count({ where: { isActive: false } })
  const totalAll = await prisma.dataSource.count()

  console.log('\n' + '=' .repeat(100))
  console.log(`📊 统计：激活 ${totalActive} 个 | 禁用 ${totalInactive} 个 | 总计 ${totalAll} 个`)
  console.log('=' .repeat(100))
}

deleteDuplicateDataSources()
  .catch((e) => {
    console.error('❌ 操作失败:', e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
