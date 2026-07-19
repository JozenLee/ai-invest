// 添加带有情感值和领域关联的测试新闻数据
import prisma from '@/lib/db/prisma'

async function main() {
  console.log('开始添加测试新闻数据...')

  // 获取分类和领域
  const categories = await prisma.newsCategory.findMany()
  const domains = await prisma.domain.findMany()

  if (categories.length === 0 || domains.length === 0) {
    console.error('❌ 请先运行 npm run db:seed 创建分类和领域')
    process.exit(1)
  }

  // 创建测试新闻数据
  const newsData = [
    {
      id: 'news-001',
      title: 'OpenAI发布GPT-5，AI算力需求激增',
      content: 'OpenAI今日正式发布GPT-5模型，性能较GPT-4提升50%，预计将带动全球AI算力需求大幅增长。',
      summary: 'GPT-5发布，AI算力需求激增',
      source: '科技日报',
      url: 'https://example.com/news-001',
      publishTime: new Date('2026-07-19T10:00:00'),
      category: 'ai',
      categoryId: categories.find(c => c.code === 'ai')?.id || categories[0].id,
      domainId: domains.find(d => d.id === 'dom_ai')?.id || domains[0].id,
      sentiment: 0.8, // 利好
      impact: 5,
      sectors: JSON.stringify(['AI算力', '芯片', '云计算']),
    },
    {
      id: 'news-002',
      title: '英伟达发布新一代AI芯片H200',
      content: '英伟达发布H200 GPU，性能提升2倍，功耗降低30%，预计将在年底量产。',
      summary: '英伟达H200芯片发布',
      source: '财联社',
      url: 'https://example.com/news-002',
      publishTime: new Date('2026-07-19T09:00:00'),
      category: 'tech',
      categoryId: categories.find(c => c.code === 'chip')?.id || categories[0].id,
      domainId: domains.find(d => d.id === 'dom_semiconductor')?.id || domains[0].id,
      sentiment: 0.9, // 强烈利好
      impact: 5,
      sectors: JSON.stringify(['半导体', 'AI算力']),
    },
    {
      id: 'news-003',
      title: '美联储维持利率不变，市场波动加剧',
      content: '美联储宣布维持利率不变，但表示可能在未来几个月内考虑降息。',
      summary: '美联储利率决议',
      source: '华尔街日报',
      url: 'https://example.com/news-003',
      publishTime: new Date('2026-07-19T08:00:00'),
      category: 'finance',
      categoryId: categories.find(c => c.code === 'macro')?.id || categories[0].id,
      domainId: null,
      sentiment: 0.0, // 中性
      impact: 3,
      sectors: JSON.stringify(['金融', '市场']),
    },
    {
      id: 'news-004',
      title: '某AI芯片公司因技术问题延迟发布',
      content: '某AI芯片公司因技术问题，将新产品发布时间推迟至明年Q1。',
      summary: 'AI芯片发布延迟',
      source: '科技新闻',
      url: 'https://example.com/news-004',
      publishTime: new Date('2026-07-19T07:00:00'),
      category: 'tech',
      categoryId: categories.find(c => c.code === 'chip')?.id || categories[0].id,
      domainId: domains.find(d => d.id === 'dom_semiconductor')?.id || domains[0].id,
      sentiment: -0.6, // 利空
      impact: 3,
      sectors: JSON.stringify(['半导体', 'AI算力']),
    },
    {
      id: 'news-005',
      title: '新能源汽车销量持续增长',
      content: '6月新能源汽车销量同比增长45%，电池技术不断突破。',
      summary: '新能源汽车销量增长',
      source: '汽车之家',
      url: 'https://example.com/news-005',
      publishTime: new Date('2026-07-18T16:00:00'),
      category: 'tech',
      categoryId: categories.find(c => c.code === 'new_energy')?.id || categories[0].id,
      domainId: domains.find(d => d.id === 'dom_new_energy')?.id || domains[0].id,
      sentiment: 0.7, // 利好
      impact: 4,
      sectors: JSON.stringify(['新能源', '电池']),
    },
    {
      id: 'news-006',
      title: '某制药公司新药临床试验失败',
      content: '某制药公司的新药在三期临床试验中未能达到主要终点。',
      summary: '新药临床试验失败',
      source: '医药新闻',
      url: 'https://example.com/news-006',
      publishTime: new Date('2026-07-18T15:00:00'),
      category: 'medical',
      categoryId: categories.find(c => c.code === 'medical')?.id || categories[0].id,
      domainId: domains.find(d => d.id === 'dom_medical')?.id || domains[0].id,
      sentiment: -0.8, // 强烈利空
      impact: 4,
      sectors: JSON.stringify(['医药', '生物科技']),
    },
    {
      id: 'news-007',
      title: 'AI模型训练成本持续下降',
      content: '随着算法优化和硬件进步，AI模型训练成本较去年下降40%。',
      summary: 'AI训练成本下降',
      source: 'AI研究院',
      url: 'https://example.com/news-007',
      publishTime: new Date('2026-07-18T14:00:00'),
      category: 'ai',
      categoryId: categories.find(c => c.code === 'ai')?.id || categories[0].id,
      domainId: domains.find(d => d.id === 'dom_ai')?.id || domains[0].id,
      sentiment: 0.5, // 利好
      impact: 3,
      sectors: JSON.stringify(['AI算力', '云计算']),
    },
    {
      id: 'news-008',
      title: '半导体行业面临周期性调整',
      content: '业内人士预计半导体行业将在未来6个月内面临周期性调整。',
      summary: '半导体周期调整',
      source: '行业分析',
      url: 'https://example.com/news-008',
      publishTime: new Date('2026-07-18T13:00:00'),
      category: 'tech',
      categoryId: categories.find(c => c.code === 'chip')?.id || categories[0].id,
      domainId: domains.find(d => d.id === 'dom_semiconductor')?.id || domains[0].id,
      sentiment: -0.3, // 轻微利空
      impact: 3,
      sectors: JSON.stringify(['半导体']),
    },
    {
      id: 'news-009',
      title: '国家加大AI产业扶持力度',
      content: '政府宣布将在未来3年投入1000亿元支持AI产业发展。',
      summary: '政府扶持AI产业',
      source: '新华社',
      url: 'https://example.com/news-009',
      publishTime: new Date('2026-07-17T18:00:00'),
      category: 'policy',
      categoryId: categories.find(c => c.code === 'policy')?.id || categories[0].id,
      domainId: domains.find(d => d.id === 'dom_ai')?.id || domains[0].id,
      sentiment: 0.85, // 强烈利好
      impact: 5,
      sectors: JSON.stringify(['AI算力', '政策']),
    },
    {
      id: 'news-010',
      title: '云计算市场竞争加剧',
      content: '各大云服务商纷纷降价，市场竞争日趋激烈。',
      summary: '云计算价格战',
      source: '云计算观察',
      url: 'https://example.com/news-010',
      publishTime: new Date('2026-07-17T17:00:00'),
      category: 'tech',
      categoryId: categories.find(c => c.code === 'cloud')?.id || categories[0].id,
      domainId: domains.find(d => d.id === 'dom_ai')?.id || domains[0].id,
      sentiment: -0.1, // 轻微利空
      impact: 2,
      sectors: JSON.stringify(['云计算', '互联网']),
    },
    {
      id: 'news-011',
      title: '电池技术取得重大突破',
      content: '研究团队开发出新型固态电池，能量密度提升50%，充电时间缩短至10分钟。',
      summary: '固态电池技术突破',
      source: '科学日报',
      url: 'https://example.com/news-011',
      publishTime: new Date('2026-07-17T16:30:00'),
      category: 'tech',
      categoryId: categories.find(c => c.code === 'new_energy')?.id || categories[0].id,
      domainId: domains.find(d => d.id === 'dom_new_energy')?.id || domains[0].id,
      sentiment: 0.95, // 极强利好
      impact: 5,
      sectors: JSON.stringify(['新能源', '电池', '汽车']),
    },
    {
      id: 'news-012',
      title: '医疗AI辅助诊断系统获批上市',
      content: '国内首款AI辅助诊断系统获得医疗器械注册证，准确率达95%。',
      summary: '医疗AI系统获批',
      source: '医疗健康网',
      url: 'https://example.com/news-012',
      publishTime: new Date('2026-07-17T15:00:00'),
      category: 'medical',
      categoryId: categories.find(c => c.code === 'medical')?.id || categories[0].id,
      domainId: domains.find(d => d.id === 'dom_medical')?.id || domains[0].id,
      sentiment: 0.75, // 利好
      impact: 4,
      sectors: JSON.stringify(['医药', 'AI应用']),
    },
  ]

  // 批量创建或更新新闻
  let created = 0
  let updated = 0

  for (const news of newsData) {
    const existing = await prisma.newsArticle.findUnique({
      where: { id: news.id },
    })

    if (existing) {
      await prisma.newsArticle.update({
        where: { id: news.id },
        data: news,
      })
      updated++
    } else {
      await prisma.newsArticle.create({
        data: news,
      })
      created++
    }
  }

  console.log(`✅ 新闻数据添加完成：创建 ${created} 条，更新 ${updated} 条`)

  // 统计信息
  const stats = await prisma.newsArticle.groupBy({
    by: ['domainId'],
    _count: true,
  })

  console.log('\n📊 按领域统计：')
  for (const stat of stats) {
    if (stat.domainId) {
      const domain = await prisma.domain.findUnique({
        where: { id: stat.domainId },
      })
      console.log(`  ${domain?.name || stat.domainId}: ${stat._count} 条`)
    } else {
      console.log(`  未分类: ${stat._count} 条`)
    }
  }

  // 情感分布统计
  const total = await prisma.newsArticle.count()
  const bullish = await prisma.newsArticle.count({
    where: { sentiment: { gt: 0.2 } },
  })
  const bearish = await prisma.newsArticle.count({
    where: { sentiment: { lt: -0.2 } },
  })
  const neutral = await prisma.newsArticle.count({
    where: { sentiment: { gte: -0.2, lte: 0.2 } },
  })

  console.log('\n📊 情感分布：')
  console.log(`  总计: ${total} 条`)
  console.log(`  利好: ${bullish} 条`)
  console.log(`  中性: ${neutral} 条`)
  console.log(`  利空: ${bearish} 条`)
}

main()
  .catch((e) => {
    console.error('❌ 添加新闻数据失败:', e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
