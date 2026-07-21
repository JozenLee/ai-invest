import { PrismaClient } from '@prisma/client'
import { PrismaBetterSqlite3 } from '@prisma/adapter-better-sqlite3'

const adapter = new PrismaBetterSqlite3({
  url: process.env.DATABASE_URL || 'file:./prisma/dev.db',
})

const prisma = new PrismaClient({
  adapter,
})

async function cleanupAndAddDataSources() {
  console.log('开始清理和添加数据源...\n')

  // 1. 识别重复的数据源（财联社有2个，财新网有2个）
  const duplicates = [
    { id: 'ds_cls', reason: '与 ds_akshare_cailian 重复，且 provider 配置不明确' },
    { id: 'ds_caixin', reason: '与 ds_akshare_caixin 重复，custom crawler 不稳定' },
  ]

  // 2. 识别无效/不可用的数据源
  const invalid = [
    { id: 'ds_sina_finance', reason: 'RSS provider 未实现' },
    { id: 'ds_jiemian', reason: 'custom API 未实现，配置不完整' },
    { id: 'ds_36kr', reason: '与 NewsNow 36kr 功能重复，custom API 不稳定' },
    { id: 'ds_leiphone', reason: 'RSS provider 未实现' },
    { id: 'ds_pingwest', reason: 'custom crawler 未实现' },
    { id: 'ds_geekpark', reason: 'custom API 未实现' },
    { id: 'ds_weibo_tech', reason: 'weibo provider 未实现' },
    { id: 'ds_zhihu_finance', reason: 'zhihu provider 未实现' },
    { id: 'ds_bilibili_tech', reason: 'bilibili provider 未实现' },
    { id: 'ds_douyin_finance', reason: 'douyin provider 未实现' },
    { id: 'ds_youtube_tech', reason: 'youtube provider 未实现' },
  ]

  const toDelete = [...duplicates, ...invalid]

  console.log('📋 待删除的数据源：')
  console.log('=' .repeat(80))
  toDelete.forEach((item, idx) => {
    console.log(`${idx + 1}. ${item.id}`)
    console.log(`   原因: ${item.reason}`)
  })
  console.log('=' .repeat(80))
  console.log(`总计: ${toDelete.length} 个\n`)

  // 3. 删除无效数据源
  for (const item of toDelete) {
    try {
      await prisma.dataSource.delete({
        where: { id: item.id }
      })
      console.log(`✅ 已删除: ${item.id}`)
    } catch (error) {
      console.log(`⚠️  删除失败 ${item.id}: 可能不存在`)
    }
  }

  console.log('\n')

  // 4. 添加 NewsNow 数据源
  const newsNowSources = [
    {
      id: 'ds_newsnow_wallstreet',
      name: '华尔街见闻-NewsNow',
      type: 'financial',
      driverType: 'api',
      provider: 'newsnow',
      category: '综合财经媒体',
      config: JSON.stringify({ keyword: 'wallstreetcn-hot', limit: 50 }),
      updateFrequency: 30,
      isActive: true,
    },
    {
      id: 'ds_newsnow_cailian',
      name: '财联社热榜-NewsNow',
      type: 'financial',
      driverType: 'api',
      provider: 'newsnow',
      category: '综合财经媒体',
      config: JSON.stringify({ keyword: 'cls-hot', limit: 50 }),
      updateFrequency: 30,
      isActive: true,
    },
    {
      id: 'ds_newsnow_thepaper',
      name: '澎湃财经-NewsNow',
      type: 'financial',
      driverType: 'api',
      provider: 'newsnow',
      category: '综合财经媒体',
      config: JSON.stringify({ keyword: 'thepaper', limit: 50 }),
      updateFrequency: 60,
      isActive: true,
    },
    {
      id: 'ds_newsnow_36kr',
      name: '36氪-NewsNow',
      type: 'financial',
      driverType: 'api',
      provider: 'newsnow',
      category: '科技创投媒体',
      config: JSON.stringify({ keyword: '36kr', limit: 30 }),
      updateFrequency: 60,
      isActive: true,
    },
  ]

  console.log('📋 待添加的 NewsNow 数据源：')
  console.log('=' .repeat(80))
  newsNowSources.forEach((item, idx) => {
    console.log(`${idx + 1}. ${item.name} (${item.id})`)
    console.log(`   Provider: ${item.provider} | 频率: ${item.updateFrequency}分钟`)
  })
  console.log('=' .repeat(80))
  console.log(`总计: ${newsNowSources.length} 个\n`)

  // 5. 添加 NewsNow 数据源
  for (const source of newsNowSources) {
    try {
      await prisma.dataSource.upsert({
        where: { id: source.id },
        update: source,
        create: source,
      })
      console.log(`✅ 已添加: ${source.name}`)
    } catch (error) {
      console.log(`❌ 添加失败 ${source.name}:`, error)
    }
  }

  console.log('\n')

  // 6. 显示清理后的数据源列表
  const remainingSources = await prisma.dataSource.findMany({
    orderBy: { createdAt: 'asc' }
  })

  console.log('📊 清理后的数据源列表：')
  console.log('=' .repeat(80))

  const grouped = remainingSources.reduce((acc, ds) => {
    if (!acc[ds.category]) acc[ds.category] = []
    acc[ds.category].push(ds)
    return acc
  }, {} as Record<string, typeof remainingSources>)

  Object.entries(grouped).forEach(([category, sources]) => {
    console.log(`\n${category} (${sources.length}个):`)
    sources.forEach((ds) => {
      console.log(`  - ${ds.name} (${ds.provider})`)
    })
  })

  console.log('\n' + '=' .repeat(80))
  console.log(`总计: ${remainingSources.length} 个数据源`)
  console.log('\n✨ 数据源清理完成！')
}

cleanupAndAddDataSources()
  .catch((e) => {
    console.error('❌ 操作失败:', e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
