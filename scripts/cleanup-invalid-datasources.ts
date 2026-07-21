import { PrismaClient } from '@prisma/client'
import { PrismaBetterSqlite3 } from '@prisma/adapter-better-sqlite3'

const adapter = new PrismaBetterSqlite3({
  url: process.env.DATABASE_URL || 'file:./prisma/dev.db',
})

const prisma = new PrismaClient({
  adapter,
})

async function cleanupDuplicatesAndInvalid() {
  console.log('开始清理重复和无效的数据源...\n')

  // 获取所有数据源
  const allSources = await prisma.dataSource.findMany()

  console.log(`当前总数: ${allSources.length} 个数据源\n`)

  // 分析需要删除的数据源
  const toDelete: string[] = []

  // 1. 删除旧的财联社（保留 ds_akshare_cailian 和新的 NewsNow）
  const oldCLS = allSources.find(ds => ds.id === 'ds_cls')
  if (oldCLS) {
    toDelete.push('ds_cls')
    console.log(`❌ 标记删除: 财联社 (ds_cls) - 与 ds_akshare_cailian 重复`)
  }

  // 2. 删除旧的财新网（保留 ds_akshare_caixin）
  const oldCaixin = allSources.find(ds => ds.id === 'ds_caixin')
  if (oldCaixin) {
    toDelete.push('ds_caixin')
    console.log(`❌ 标记删除: 财新网 (ds_caixin) - 与 ds_akshare_caixin 重复`)
  }

  // 3. 删除未实现的 provider
  const unimplementedProviders = ['rss', 'custom', 'weibo', 'zhihu', 'bilibili', 'douyin', 'youtube']

  allSources.forEach(ds => {
    if (unimplementedProviders.includes(ds.provider) && !toDelete.includes(ds.id)) {
      toDelete.push(ds.id)
      console.log(`❌ 标记删除: ${ds.name} (${ds.id}) - ${ds.provider} provider 未实现`)
    }
  })

  console.log(`\n总计标记删除: ${toDelete.length} 个\n`)

  if (toDelete.length === 0) {
    console.log('✅ 没有需要删除的数据源')
    return
  }

  // 执行删除
  console.log('开始执行删除...\n')
  let successCount = 0
  let failCount = 0

  for (const id of toDelete) {
    try {
      await prisma.dataSource.delete({ where: { id } })
      successCount++
      console.log(`✅ 已删除: ${id}`)
    } catch (error) {
      failCount++
      console.log(`⚠️  删除失败: ${id}`)
    }
  }

  console.log(`\n删除结果: 成功 ${successCount} 个, 失败 ${failCount} 个\n`)

  // 显示清理后的列表
  const remaining = await prisma.dataSource.findMany({
    orderBy: { name: 'asc' }
  })

  console.log('=' .repeat(80))
  console.log('📊 清理后的数据源列表')
  console.log('=' .repeat(80))

  const grouped: Record<string, typeof remaining> = {}
  remaining.forEach(ds => {
    if (!grouped[ds.provider]) grouped[ds.provider] = []
    grouped[ds.provider].push(ds)
  })

  Object.entries(grouped).forEach(([provider, sources]) => {
    console.log(`\n${provider.toUpperCase()} (${sources.length}个):`)
    sources.forEach(ds => {
      const status = ds.isActive ? '✓' : '✗'
      console.log(`  ${status} ${ds.name} - ${ds.updateFrequency}分钟`)
    })
  })

  console.log('\n' + '=' .repeat(80))
  console.log(`✨ 清理完成！剩余 ${remaining.length} 个有效数据源`)
  console.log('=' .repeat(80))
}

cleanupDuplicatesAndInvalid()
  .catch((e) => {
    console.error('❌ 操作失败:', e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
