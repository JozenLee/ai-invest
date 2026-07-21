import { PrismaClient } from '@prisma/client'
import { PrismaBetterSqlite3 } from '@prisma/adapter-better-sqlite3'

const adapter = new PrismaBetterSqlite3({
  url: process.env.DATABASE_URL || 'file:./prisma/dev.db',
})

const prisma = new PrismaClient({
  adapter,
})

async function addMissingSchedulers() {
  console.log('开始检查并添加缺失的调度器任务...\n')

  // 1. 查询所有缺少 SchedulerJob 的数据源
  const allSources = await prisma.dataSource.findMany({
    include: {
      schedulerJobs: true,
    },
  })

  const sourcesWithoutScheduler = allSources.filter(
    (source) => source.schedulerJobs.length === 0
  )

  if (sourcesWithoutScheduler.length === 0) {
    console.log('✅ 所有数据源都已配置调度器任务！')
    return
  }

  console.log('📋 发现缺少调度器的数据源：')
  console.log('='.repeat(80))
  sourcesWithoutScheduler.forEach((source, idx) => {
    console.log(`${idx + 1}. ${source.name}`)
    console.log(`   ID: ${source.id}`)
    console.log(`   Provider: ${source.provider}`)
    console.log(`   Type: ${source.type}`)
  })
  console.log('='.repeat(80))
  console.log(`总计: ${sourcesWithoutScheduler.length} 个\n`)

  // 2. 为每个数据源创建调度器任务
  let createdCount = 0
  let skippedCount = 0

  for (const source of sourcesWithoutScheduler) {
    // 根据 provider 确定调度间隔
    let intervalMinutes = 60 // 默认 60 分钟

    if (source.provider === 'newsnow') {
      // NewsNow 类数据源：30 分钟
      intervalMinutes = 30
    } else if (source.provider === 'akshare') {
      // AKShare 类数据源：60 分钟
      intervalMinutes = 60
    }

    const scheduleConfig = {
      intervalMinutes,
    }

    try {
      // 检查是否已存在（幂等性保证）
      const existing = await prisma.schedulerJob.findFirst({
        where: { sourceId: source.id },
      })

      if (existing) {
        console.log(`⏭️  跳过 ${source.name}: 调度器已存在`)
        skippedCount++
        continue
      }

      // 创建调度器任务
      await prisma.schedulerJob.create({
        data: {
          sourceId: source.id,
          scheduleType: 'interval',
          scheduleConfig: JSON.stringify(scheduleConfig),
          isEnabled: true,
        },
      })

      console.log(`✅ 已创建调度器: ${source.name}`)
      console.log(`   间隔: ${intervalMinutes} 分钟`)
      createdCount++
    } catch (error) {
      console.error(`❌ 创建失败 ${source.name}:`, error)
    }
  }

  console.log('\n' + '='.repeat(80))
  console.log(`✨ 调度器添加完成！`)
  console.log(`   新增: ${createdCount} 个`)
  console.log(`   跳过: ${skippedCount} 个`)
  console.log('='.repeat(80))

  // 3. 显示最终状态
  console.log('\n📊 最终调度器配置：\n')

  const allSourcesUpdated = await prisma.dataSource.findMany({
    include: {
      schedulerJobs: true,
    },
    orderBy: { provider: 'asc' },
  })

  const grouped = allSourcesUpdated.reduce((acc, source) => {
    if (!acc[source.provider]) {
      acc[source.provider] = []
    }
    acc[source.provider].push(source)
    return acc
  }, {} as Record<string, typeof allSourcesUpdated>)

  Object.entries(grouped).forEach(([provider, sources]) => {
    console.log(`\n${provider.toUpperCase()} (${sources.length}个):`)
    sources.forEach((source) => {
      const hasScheduler = source.schedulerJobs.length > 0
      const status = hasScheduler ? '✅' : '❌'
      let interval = ''

      if (hasScheduler && source.schedulerJobs[0]) {
        try {
          const config = JSON.parse(source.schedulerJobs[0].scheduleConfig)
          interval = ` - ${config.intervalMinutes}分钟`
        } catch {
          interval = ' - 未知间隔'
        }
      }

      console.log(`  ${status} ${source.name}${interval}`)
    })
  })

  console.log('\n')
}

addMissingSchedulers()
  .catch((e) => {
    console.error('❌ 操作失败:', e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
