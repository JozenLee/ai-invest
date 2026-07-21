import { PrismaClient } from '@prisma/client'
import { PrismaBetterSqlite3 } from '@prisma/adapter-better-sqlite3'

const adapter = new PrismaBetterSqlite3({
  url: process.env.DATABASE_URL || 'file:./prisma/dev.db',
})

const prisma = new PrismaClient({
  adapter,
})

async function deactivateInvalidDataSources() {
  console.log('开始禁用无效的数据源（保留数据，仅标记为不激活）...\n')

  const allSources = await prisma.dataSource.findMany({
    where: { isActive: true }
  })

  console.log(`当前激活的数据源: ${allSources.length} 个\n`)

  // 需要禁用的 provider
  const unimplementedProviders = ['rss', 'custom', 'weibo', 'zhihu', 'bilibili', 'douyin', 'youtube']

  const toDeactivate: Array<{ id: string; name: string; provider: string; reason: string }> = []

  allSources.forEach((ds) => {
    // 未实现的 provider
    if (unimplementedProviders.includes(ds.provider)) {
      toDeactivate.push({
        id: ds.id,
        name: ds.name,
        provider: ds.provider,
        reason: `${ds.provider} provider 未实现`
      })
    }
    // 重复的财联社（保留 AKShare 和 NewsNow 版本）
    else if (ds.name === '财联社' && ds.id === 'ds_cls') {
      toDeactivate.push({
        id: ds.id,
        name: ds.name,
        provider: ds.provider,
        reason: '与 ds_akshare_cailian 和 NewsNow 财联社热榜重复'
      })
    }
    // 重复的东方财富（内容质量一般，保留但禁用）
    else if (ds.name === '东方财富' && ds.provider === 'akshare') {
      toDeactivate.push({
        id: ds.id,
        name: ds.name,
        provider: ds.provider,
        reason: '内容质量一般，已有其他优质财经媒体'
      })
    }
  })

  if (toDeactivate.length === 0) {
    console.log('✅ 没有需要禁用的数据源')
    await prisma.$disconnect()
    return
  }

  console.log('📋 待禁用的数据源：')
  console.log('=' .repeat(100))
  toDeactivate.forEach((item, idx) => {
    console.log(`${idx + 1}. ${item.name} (${item.id})`)
    console.log(`   Provider: ${item.provider} | 原因: ${item.reason}`)
  })
  console.log('=' .repeat(100))
  console.log(`\n总计: ${toDeactivate.length} 个\n`)

  // 执行禁用
  let successCount = 0

  for (const item of toDeactivate) {
    try {
      await prisma.dataSource.update({
        where: { id: item.id },
        data: { isActive: false }
      })
      successCount++
      console.log(`✅ 已禁用: ${item.name} (${item.id})`)
    } catch (error: any) {
      console.log(`❌ 禁用失败: ${item.name} (${item.id}) - ${error.message}`)
    }
  }

  console.log(`\n禁用结果: 成功 ${successCount} 个\n`)

  // 显示清理后的激活数据源列表
  const activeRemaining = await prisma.dataSource.findMany({
    where: { isActive: true },
    orderBy: { provider: 'asc' }
  })

  console.log('=' .repeat(100))
  console.log('✨ 清理后的激活数据源列表')
  console.log('=' .repeat(100))

  const grouped: Record<string, typeof activeRemaining> = {}
  activeRemaining.forEach(ds => {
    const key = ds.provider.toUpperCase()
    if (!grouped[key]) grouped[key] = []
    grouped[key].push(ds)
  })

  Object.entries(grouped).forEach(([provider, sources]) => {
    console.log(`\n${provider} (${sources.length}个):`)
    sources.forEach((ds, idx) => {
      console.log(`  ${idx + 1}. ${ds.name}`)
      console.log(`     ID: ${ds.id}`)
      console.log(`     更新频率: ${ds.updateFrequency}分钟 | 分类: ${ds.category}`)
    })
  })

  console.log('\n' + '=' .repeat(100))
  console.log(`总计: ${activeRemaining.length} 个激活的数据源`)
  console.log('=' .repeat(100))

  // 显示被禁用的数据源统计
  const deactivated = await prisma.dataSource.count({
    where: { isActive: false }
  })

  console.log(`\n💤 已禁用: ${deactivated} 个数据源（数据已保留，可随时重新激活）\n`)
}

deactivateInvalidDataSources()
  .catch((e) => {
    console.error('❌ 操作失败:', e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
