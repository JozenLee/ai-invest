import { PrismaClient } from '@prisma/client'
import { PrismaBetterSqlite3 } from '@prisma/adapter-better-sqlite3'

const adapter = new PrismaBetterSqlite3({
  url: process.env.DATABASE_URL || 'file:./prisma/dev.db',
})

const prisma = new PrismaClient({ adapter })

async function main() {
  console.log('开始添加数据源种子数据...')

  // 定义15个示例数据源，分为4个类别
  const dataSources = [
    // 类别1: 综合财经媒体 (5个)
    {
      id: 'ds_cls',
      name: '财联社',
      type: 'financial',
      driverType: 'api',
      provider: 'akshare',
      category: '综合财经媒体',
      config: JSON.stringify({ keyword: '财联社', limit: 200 }),
      updateFrequency: 60,
    },
    {
      id: 'ds_eastmoney',
      name: '东方财富',
      type: 'financial',
      driverType: 'api',
      provider: 'akshare',
      category: '综合财经媒体',
      config: JSON.stringify({ keyword: '东方财富', limit: 200 }),
      updateFrequency: 60,
    },
    {
      id: 'ds_sina_finance',
      name: '新浪财经',
      type: 'financial',
      driverType: 'rss',
      provider: 'rss',
      category: '综合财经媒体',
      config: JSON.stringify({ url: 'https://finance.sina.com.cn/rss/', limit: 100 }),
      updateFrequency: 30,
    },
    {
      id: 'ds_caixin',
      name: '财新网',
      type: 'financial',
      driverType: 'crawler',
      provider: 'custom',
      category: '综合财经媒体',
      config: JSON.stringify({ baseUrl: 'https://www.caixin.com/', selector: '.article-list' }),
      updateFrequency: 120,
    },
    {
      id: 'ds_jiemian',
      name: '界面新闻',
      type: 'financial',
      driverType: 'api',
      provider: 'custom',
      category: '综合财经媒体',
      config: JSON.stringify({ apiUrl: 'https://www.jiemian.com/api/articles', limit: 100 }),
      updateFrequency: 60,
    },

    // 类别2: 科技媒体 (4个)
    {
      id: 'ds_36kr',
      name: '36氪',
      type: 'financial',
      driverType: 'api',
      provider: 'custom',
      category: '科技媒体',
      config: JSON.stringify({ apiUrl: 'https://36kr.com/api/newsflash', limit: 100 }),
      updateFrequency: 30,
    },
    {
      id: 'ds_leiphone',
      name: '雷锋网',
      type: 'financial',
      driverType: 'rss',
      provider: 'rss',
      category: '科技媒体',
      config: JSON.stringify({ url: 'https://www.leiphone.com/feed', limit: 50 }),
      updateFrequency: 60,
    },
    {
      id: 'ds_pingwest',
      name: '品玩',
      type: 'financial',
      driverType: 'crawler',
      provider: 'custom',
      category: '科技媒体',
      config: JSON.stringify({ baseUrl: 'https://www.pingwest.com/', selector: '.article-item' }),
      updateFrequency: 60,
    },
    {
      id: 'ds_geekpark',
      name: '极客公园',
      type: 'financial',
      driverType: 'api',
      provider: 'custom',
      category: '科技媒体',
      config: JSON.stringify({ apiUrl: 'https://www.geekpark.net/api/articles', limit: 80 }),
      updateFrequency: 90,
    },

    // 类别3: 社交媒体 (3个)
    {
      id: 'ds_weibo_tech',
      name: '微博-科技',
      type: 'social',
      driverType: 'social',
      provider: 'weibo',
      category: '社交媒体',
      config: JSON.stringify({ keywords: ['AI', '芯片', '半导体'], limit: 100 }),
      updateFrequency: 15,
    },
    {
      id: 'ds_zhihu_finance',
      name: '知乎-财经',
      type: 'social',
      driverType: 'social',
      provider: 'zhihu',
      category: '社交媒体',
      config: JSON.stringify({ topics: ['投资', '股票', 'ETF'], limit: 50 }),
      updateFrequency: 30,
    },
    {
      id: 'ds_xueqiu',
      name: '雪球',
      type: 'social',
      driverType: 'api',
      provider: 'xueqiu',
      category: '社交媒体',
      config: JSON.stringify({ keywords: ['AI算力', '新能源'], limit: 100 }),
      updateFrequency: 20,
    },

    // 类别4: 视频平台 (3个)
    {
      id: 'ds_bilibili_tech',
      name: 'B站-科技区',
      type: 'video',
      driverType: 'api',
      provider: 'bilibili',
      category: '视频平台',
      config: JSON.stringify({ category: '科技', keywords: ['AI', '芯片'], limit: 50 }),
      updateFrequency: 60,
    },
    {
      id: 'ds_douyin_finance',
      name: '抖音-财经',
      type: 'video',
      driverType: 'api',
      provider: 'douyin',
      category: '视频平台',
      config: JSON.stringify({ hashtags: ['财经', '投资'], limit: 50 }),
      updateFrequency: 60,
    },
    {
      id: 'ds_youtube_tech',
      name: 'YouTube-科技',
      type: 'video',
      driverType: 'api',
      provider: 'youtube',
      category: '视频平台',
      config: JSON.stringify({ keywords: ['AI', 'chip', 'semiconductor'], limit: 30 }),
      updateFrequency: 120,
    },
  ]

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
