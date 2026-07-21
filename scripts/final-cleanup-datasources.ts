import { PrismaClient } from '@prisma/client'
import { PrismaBetterSqlite3 } from '@prisma/adapter-better-sqlite3'

const adapter = new PrismaBetterSqlite3({
  url: process.env.DATABASE_URL || 'file:./prisma/dev.db',
})

const prisma = new PrismaClient({
  adapter,
})

async function findAndCleanup() {
  console.log('查询数据库中的实际数据源...\n')

  const allSources = await prisma.dataSource.findMany({
    orderBy: { createdAt: 'asc' }
  })

  console.log(`总数: ${allSources.length}\n`)

  // 分类显示
  const unimplementedProviders = ['rss', 'custom', 'weibo', 'zhihu', 'bilibili', 'douyin', 'youtube']

  const toDelete: Array<{ id: string; name: string; provider: string; reason: string }> = []

  allSources.forEach((ds) => {
    // 检查是否是未实现的 provider
    if (unimplementedProviders.includes(ds.provider)) {
      toDelete.push({
        id: ds.id,
        name: ds.name,
        provider: ds.provider,
        reason: `${ds.provider} provider 未实现`
      })
    }
    // 检查重复的财联社
    else if (ds.name === '财联社' && ds.id !== 'ds_akshare_cailian') {
      toDelete.push({
        id: ds.id,
        name: ds.name,
        provider: ds.provider,
        reason: '与 ds_akshare_cailian 和 NewsNow 重复'
      })
    }
    // 检查重复的财新网
    else if (ds.name === '财新网' && ds.provider === 'custom') {
      toDelete.push({
        id: ds.id,
        name: ds.name,
        provider: ds.provider,
        reason: '与 ds_akshare_caixin 重复'
      })
    }
    // 检查重复的东方财富
    else if (ds.name === '东方财富' && ds.provider === 'akshare') {
      // 东方财富没有其他来源，但内容质量一般，可以考虑禁用
      // 暂时保留
    }
  })

  if (toDelete.length === 0) {
    console.log('✅ 没有需要删除的数据源')
    await prisma.$disconnect()
    return
  }

  console.log('📋 待删除的数据源：')
  console.log('=' .repeat(100))
  toDelete.forEach((item, idx) => {
    console.log(`${idx + 1}. ${item.name} (${item.id})`)
    console.log(`   Provider: ${item.provider} | 原因: ${item.reason}`)
  })
  console.log('=' .repeat(100))
  console.log(`\n总计: ${toDelete.length} 个\n`)

  // 确认是否执行删除
  console.log('⚠️  即将删除以上数据源...\n')

  // 执行删除
  let successCount = 0
  let failCount = 0

  for (const item of toDelete) {
    try {
      await prisma.dataSource.delete({ where: { id: item.id } })
      successCount++
      console.log(`✅ 已删除: ${item.name} (${item.id})`)
    } catch (error: any) {
      failCount++
      console.log(`❌ 删除失败: ${item.name} (${item.id}) - ${error.message}`)
    }
  }

  console.log(`\n删除结果: 成功 ${successCount} 个, 失败 ${failCount} 个\n`)

  // 显示清理后的列表
  const remaining = await prisma.dataSource.findMany({
    where: { isActive: true },
    orderBy: { provider: 'asc' }
  })

  console.log('=' .repeat(100))
  console.log('✨ 清理后的有效数据源列表')
  console.log('=' .repeat(100))

  const grouped: Record<string, typeof remaining> = {}
  remaining.forEach(ds => {
    const key = `${ds.provider.toUpperCase()}`
    if (!grouped[key]) grouped[key] = []
    grouped[key].push(ds)
  })

  Object.entries(grouped).forEach(([provider, sources]) => {
    console.log(`\n${provider} (${sources.length}个):`)
    sources.forEach((ds, idx) => {
      console.log(`  ${idx + 1}. ${ds.name}`)
      console.log(`     更新频率: ${ds.updateFrequency}分钟 | 分类: ${ds.category}`)
    })
  })

  console.log('\n' + '=' .repeat(100))
  console.log(`总计: ${remaining.length} 个有效数据源`)
  console.log('=' .repeat(100))
}

findAndCleanup()
  .catch((e) => {
    console.error('❌ 操作失败:', e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
