import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function main() {
  console.log('开始初始化分类数据...')

  // 创建一级分类
  const categories = [
    { id: 'cat_tech', name: '科技', code: 'tech', sortOrder: 1 },
    { id: 'cat_finance', name: '财经', code: 'finance', sortOrder: 2 },
    { id: 'cat_politics', name: '政治', code: 'politics', sortOrder: 3 },
    { id: 'cat_society', name: '社会', code: 'society', sortOrder: 4 },
    { id: 'cat_international', name: '国际', code: 'international', sortOrder: 5 },
    { id: 'cat_industry', name: '产业', code: 'industry', sortOrder: 6 },
  ]

  for (const cat of categories) {
    await prisma.newsCategory.upsert({
      where: { code: cat.code },
      update: {},
      create: cat,
    })
  }
  console.log('✅ 一级分类创建完成')

  // 创建二级分类
  const subCategories = [
    // 科技类
    { id: 'cat_product', name: '产品发布', code: 'product', parentId: 'cat_tech', sortOrder: 1 },
    { id: 'cat_breakthrough', name: '技术突破', code: 'breakthrough', parentId: 'cat_tech', sortOrder: 2 },
    { id: 'cat_ai', name: '人工智能', code: 'ai', parentId: 'cat_tech', sortOrder: 3 },
    { id: 'cat_chip', name: '芯片半导体', code: 'chip', parentId: 'cat_tech', sortOrder: 4 },
    { id: 'cat_internet', name: '互联网', code: 'internet', parentId: 'cat_tech', sortOrder: 5 },

    // 财经类
    { id: 'cat_earnings', name: '财报业绩', code: 'earnings', parentId: 'cat_finance', sortOrder: 1 },
    { id: 'cat_merger', name: '合作并购', code: 'merger', parentId: 'cat_finance', sortOrder: 2 },
    { id: 'cat_capital', name: '资本市场', code: 'capital', parentId: 'cat_finance', sortOrder: 3 },
    { id: 'cat_macro', name: '宏观经济', code: 'macro', parentId: 'cat_finance', sortOrder: 4 },

    // 政治类
    { id: 'cat_policy', name: '政策法规', code: 'policy', parentId: 'cat_politics', sortOrder: 1 },
    { id: 'cat_regulation', name: '监管制裁', code: 'regulation', parentId: 'cat_politics', sortOrder: 2 },
    { id: 'cat_government', name: '政府动态', code: 'government', parentId: 'cat_politics', sortOrder: 3 },

    // 社会类
    { id: 'cat_event', name: '社会事件', code: 'event', parentId: 'cat_society', sortOrder: 1 },
    { id: 'cat_consume', name: '消费生活', code: 'consume', parentId: 'cat_society', sortOrder: 2 },

    // 国际类
    { id: 'cat_geopolitics', name: '地缘政治', code: 'geopolitics', parentId: 'cat_international', sortOrder: 1 },
    { id: 'cat_global_market', name: '全球市场', code: 'global_market', parentId: 'cat_international', sortOrder: 2 },
    { id: 'cat_trade', name: '国际贸易', code: 'trade', parentId: 'cat_international', sortOrder: 3 },

    // 产业类
    { id: 'cat_supply', name: '供应链', code: 'supply', parentId: 'cat_industry', sortOrder: 1 },
    { id: 'cat_capacity', name: '产能扩张', code: 'capacity', parentId: 'cat_industry', sortOrder: 2 },
    { id: 'cat_competition', name: '竞争格局', code: 'competition', parentId: 'cat_industry', sortOrder: 3 },
    { id: 'cat_new_energy', name: '新能源', code: 'new_energy', parentId: 'cat_industry', sortOrder: 4 },
    { id: 'cat_medical', name: '医药医疗', code: 'medical', parentId: 'cat_industry', sortOrder: 5 },
  ]

  for (const cat of subCategories) {
    await prisma.newsCategory.upsert({
      where: { code: cat.code },
      update: {},
      create: cat,
    })
  }
  console.log('✅ 二级分类创建完成')

  // 创建默认领域
  const domains = [
    { id: 'dom_ai', name: 'AI算力', code: 'ai', description: '人工智能、芯片、服务器、数据中心等', keywords: '["AI","芯片","GPU","服务器","数据中心","算力","大模型"]', graphNodes: '[]' },
    { id: 'dom_new_energy', name: '新能源', code: 'new_energy', description: '光伏、风电、储能、新能源汽车等', keywords: '["光伏","风电","储能","新能源汽车","锂电","电池"]', graphNodes: '[]' },
    { id: 'dom_medical', name: '医药医疗', code: 'medical', description: '创新药、医疗器械、医疗服务等', keywords: '["创新药","医疗器械","医疗服务","CXO","疫苗","生物医药"]', graphNodes: '[]' },
    { id: 'dom_semiconductor', name: '半导体', code: 'semiconductor', description: '芯片设计、晶圆制造、封装测试等', keywords: '["半导体","芯片","晶圆","封装","光刻","集成电路"]', graphNodes: '[]' },
    { id: 'dom_internet', name: '互联网', code: 'internet', description: '电商、社交、游戏、云计算等', keywords: '["互联网","电商","社交","游戏","云计算","SaaS"]', graphNodes: '[]' },
    { id: 'dom_finance', name: '金融', code: 'finance', description: '银行、保险、证券、基金等', keywords: '["金融","银行","保险","证券","基金","投资"]', graphNodes: '[]' },
  ]

  for (const domain of domains) {
    await prisma.domain.upsert({
      where: { code: domain.code },
      update: {},
      create: domain,
    })
  }
  console.log('✅ 默认领域创建完成')

  // 创建默认数据源
  const dataSources = [
    {
      id: 'ds_cls',
      name: '财联社',
      type: 'financial',
      provider: 'akshare',
      config: '{"keyword":"财联社","limit":200}',
      updateFrequency: 60,
    },
    {
      id: 'ds_eastmoney',
      name: '东方财富',
      type: 'financial',
      provider: 'akshare',
      config: '{"keyword":"东方财富","limit":200}',
      updateFrequency: 60,
    },
  ]

  for (const source of dataSources) {
    await prisma.dataSource.upsert({
      where: { id: source.id },
      update: {},
      create: source,
    })
  }
  console.log('✅ 默认数据源创建完成')

  console.log('✨ 所有初始化数据创建完成！')
}

main()
  .catch((e) => {
    console.error('初始化数据失败:', e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
