import newsSourceCatalog from '../config/news-sources.json'
import { PrismaClient } from '@prisma/client'
import { PrismaBetterSqlite3 } from '@prisma/adapter-better-sqlite3'
import path from 'path'

const dbPath = path.resolve(__dirname, '../prisma/dev.db')
const adapter = new PrismaBetterSqlite3({
  url: `file:${dbPath}`,
})
const prisma = new PrismaClient({ adapter })

async function main() {
  console.log('开始初始化种子数据...')

  // ==================== 创建分类体系 ====================
  console.log('创建分类体系...')

  // 一级分类
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

  // 二级分类
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
  console.log('✅ 分类体系创建完成')

  // ==================== 创建默认领域 ====================
  console.log('创建默认领域...')

  const domains = [
    { id: 'dom_ai', name: 'AI算力', code: 'ai', description: '人工智能、芯片、服务器、数据中心等', keywords: '["AI","芯片","GPU","服务器","数据中心","算力"]', graphNodes: '[]' },
    { id: 'dom_new_energy', name: '新能源', code: 'new_energy', description: '光伏、风电、储能、新能源汽车等', keywords: '["光伏","风电","储能","新能源汽车","锂电"]', graphNodes: '[]' },
    { id: 'dom_medical', name: '医药医疗', code: 'medical', description: '创新药、医疗器械、医疗服务等', keywords: '["创新药","医疗器械","医疗服务","CXO"]', graphNodes: '[]' },
    { id: 'dom_semiconductor', name: '半导体', code: 'semiconductor', description: '芯片设计、晶圆制造、封装测试等', keywords: '["半导体","芯片","晶圆","封装","光刻"]', graphNodes: '[]' },
  ]

  for (const domain of domains) {
    await prisma.domain.upsert({
      where: { code: domain.code },
      update: {},
      create: domain,
    })
  }
  console.log('✅ 默认领域创建完成')

  // ==================== 创建默认数据源 ====================
  console.log('创建默认数据源...')

  const dataSources = newsSourceCatalog.map(({ enabled, config, ...source }) => ({ ...source, config: JSON.stringify(config), isActive: enabled }))

  for (const source of dataSources) {
    await prisma.dataSource.upsert({
      where: { id: source.id },
      update: {},
      create: source,
    })
  }
  console.log('✅ 默认数据源创建完成')

  // ==================== 创建子图数据 ====================
  console.log('开始初始化子图数据...')

  const subGraphs = [
    {
      id: 'ai_compute',
      name: 'AI算力',
      description: 'AI芯片、服务器、数据中心产业链',
      category: 'tech',
      sortOrder: 1,
    },
    {
      id: 'new_energy_vehicle',
      name: '新能源汽车',
      description: '整车、动力电池、智能驾驶产业链',
      category: 'manufacturing',
      sortOrder: 2,
    },
    {
      id: 'biotech_medical',
      name: '创新药/医疗器械',
      description: 'CXO、创新药、医疗设备产业链',
      category: 'healthcare',
      sortOrder: 3,
    },
    {
      id: 'consumer_electronics',
      name: '消费电子',
      description: '手机、AR/VR、消费芯片产业链',
      category: 'tech',
      sortOrder: 4,
    },
    {
      id: 'defense_aerospace',
      name: '军工航天',
      description: '军工电子、航空航天、北斗产业链',
      category: 'defense',
      sortOrder: 5,
    },
    {
      id: 'energy_storage',
      name: '储能/电力设备',
      description: '储能系统、特高压、电网产业链',
      category: 'energy',
      sortOrder: 6,
    },
    {
      id: 'robotics',
      name: '机器人/自动化',
      description: '工业机器人、人形机器人、减速器产业链',
      category: 'manufacturing',
      sortOrder: 7,
    },
    {
      id: 'digital_economy',
      name: '数字经济',
      description: '云计算、网络安全、数据中心产业链',
      category: 'tech',
      sortOrder: 8,
    },
    {
      id: 'advanced_materials',
      name: '先进材料',
      description: '第三代半导体、新材料、特种化工产业链',
      category: 'materials',
      sortOrder: 9,
    },
    {
      id: 'consumer',
      name: '消费',
      description: '食品饮料、零售、服务产业链',
      category: 'consumer',
      sortOrder: 10,
    },
  ]

  for (const subGraph of subGraphs) {
    await prisma.subGraph.upsert({
      where: { id: subGraph.id },
      update: {},
      create: subGraph,
    })
  }
  console.log('✅ 子图数据创建完成')

  // ==================== 更新AI算力子图节点 ====================
  console.log('开始更新AI算力子图节点...')

  // Update existing AI compute nodes with subGraphId
  const aiComputeTypes = [
    'chip_design', 'memory', 'server', 'ai_application', 'cpo',
    'optical_module', 'cooling', 'power_supply', 'hbm'
  ]

  await prisma.graphNode.updateMany({
    where: {
      type: { in: aiComputeTypes }
    },
    data: {
      subGraphId: 'ai_compute'
    }
  })

  console.log('✅ AI算力子图节点更新完成')

  // ==================== 创建新能源汽车子图节点 ====================
  console.log('开始创建新能源汽车子图节点...')

  const nevNodes = [
    // Level 0: Root
    { id: 'nev_root', type: 'nev_index', name: '新能源汽车', level: 0, subGraphId: 'new_energy_vehicle', description: '新能源汽车产业链总览' },

    // Level 1: Core segments
    { id: 'nev_vehicle', type: 'nev_l1', name: '整车制造', level: 1, parentId: 'nev_root', subGraphId: 'new_energy_vehicle' },
    { id: 'nev_battery', type: 'nev_l1', name: '动力电池', level: 1, parentId: 'nev_root', subGraphId: 'new_energy_vehicle' },
    { id: 'nev_autonomous', type: 'nev_l1', name: '智能驾驶', level: 1, parentId: 'nev_root', subGraphId: 'new_energy_vehicle' },
    { id: 'nev_charging', type: 'nev_l1', name: '充电桩', level: 1, parentId: 'nev_root', subGraphId: 'new_energy_vehicle' },

    // Level 2: Battery components
    { id: 'nev_cathode', type: 'nev_l2', name: '正极材料', level: 2, parentId: 'nev_battery', subGraphId: 'new_energy_vehicle' },
    { id: 'nev_anode', type: 'nev_l2', name: '负极材料', level: 2, parentId: 'nev_battery', subGraphId: 'new_energy_vehicle' },
    { id: 'nev_electrolyte', type: 'nev_l2', name: '电解液', level: 2, parentId: 'nev_battery', subGraphId: 'new_energy_vehicle' },
    { id: 'nev_separator', type: 'nev_l2', name: '隔膜', level: 2, parentId: 'nev_battery', subGraphId: 'new_energy_vehicle' },
    { id: 'nev_bms', type: 'nev_l2', name: '电池管理系统', level: 2, parentId: 'nev_battery', subGraphId: 'new_energy_vehicle' },

    // Level 2: Vehicle segments
    { id: 'nev_passenger', type: 'nev_l2', name: '乘用车', level: 2, parentId: 'nev_vehicle', subGraphId: 'new_energy_vehicle' },
    { id: 'nev_commercial', type: 'nev_l2', name: '商用车', level: 2, parentId: 'nev_vehicle', subGraphId: 'new_energy_vehicle' },

    // Level 2: Autonomous driving
    { id: 'nev_perception', type: 'nev_l2', name: '感知系统', level: 2, parentId: 'nev_autonomous', subGraphId: 'new_energy_vehicle' },
    { id: 'nev_compute', type: 'nev_l2', name: '计算平台', level: 2, parentId: 'nev_autonomous', subGraphId: 'new_energy_vehicle' },
    { id: 'nev_lidar', type: 'nev_l2', name: '激光雷达', level: 2, parentId: 'nev_autonomous', subGraphId: 'new_energy_vehicle' },

    // Level 2: Charging
    { id: 'nev_dc_charger', type: 'nev_l2', name: '直流充电桩', level: 2, parentId: 'nev_charging', subGraphId: 'new_energy_vehicle' },
    { id: 'nev_ac_charger', type: 'nev_l2', name: '交流充电桩', level: 2, parentId: 'nev_charging', subGraphId: 'new_energy_vehicle' },

    // Level 3: Material details
    { id: 'nev_ncm', type: 'nev_l3', name: '三元材料(NCM)', level: 3, parentId: 'nev_cathode', subGraphId: 'new_energy_vehicle' },
    { id: 'nev_lfp', type: 'nev_l3', name: '磷酸铁锂(LFP)', level: 3, parentId: 'nev_cathode', subGraphId: 'new_energy_vehicle' },
    { id: 'nev_graphite', type: 'nev_l3', name: '石墨', level: 3, parentId: 'nev_anode', subGraphId: 'new_energy_vehicle' },
    { id: 'nev_silicon', type: 'nev_l3', name: '硅基负极', level: 3, parentId: 'nev_anode', subGraphId: 'new_energy_vehicle' },
  ]

  for (const node of nevNodes) {
    await prisma.graphNode.upsert({
      where: { id: node.id },
      update: {},
      create: node,
    })
  }

  console.log('✅ 新能源汽车子图节点创建完成 (21节点)')

  // ==================== 创建消费子图节点 ====================
  console.log('开始创建消费子图节点...')

  const consumerNodes = [
    // Level 0: Root
    { id: 'consumer_root', type: 'consumer_index', name: '消费', level: 0, subGraphId: 'consumer', description: '消费产业链总览' },

    // Level 1: Core segments
    { id: 'consumer_food', type: 'consumer_l1', name: '食品饮料', level: 1, parentId: 'consumer_root', subGraphId: 'consumer' },
    { id: 'consumer_retail', type: 'consumer_l1', name: '零售', level: 1, parentId: 'consumer_root', subGraphId: 'consumer' },
    { id: 'consumer_service', type: 'consumer_l1', name: '餐饮服务', level: 1, parentId: 'consumer_root', subGraphId: 'consumer' },
    { id: 'consumer_apparel', type: 'consumer_l1', name: '服饰美妆', level: 1, parentId: 'consumer_root', subGraphId: 'consumer' },

    // Level 2: Food & Beverage
    { id: 'consumer_liquor', type: 'consumer_l2', name: '白酒', level: 2, parentId: 'consumer_food', subGraphId: 'consumer' },
    { id: 'consumer_beer', type: 'consumer_l2', name: '啤酒', level: 2, parentId: 'consumer_food', subGraphId: 'consumer' },
    { id: 'consumer_dairy', type: 'consumer_l2', name: '乳制品', level: 2, parentId: 'consumer_food', subGraphId: 'consumer' },
    { id: 'consumer_condiment', type: 'consumer_l2', name: '调味品', level: 2, parentId: 'consumer_food', subGraphId: 'consumer' },
    { id: 'consumer_snack', type: 'consumer_l2', name: '休闲食品', level: 2, parentId: 'consumer_food', subGraphId: 'consumer' },

    // Level 2: Retail
    { id: 'consumer_supermarket', type: 'consumer_l2', name: '超市', level: 2, parentId: 'consumer_retail', subGraphId: 'consumer' },
    { id: 'consumer_ecommerce', type: 'consumer_l2', name: '电商平台', level: 2, parentId: 'consumer_retail', subGraphId: 'consumer' },
    { id: 'consumer_specialty', type: 'consumer_l2', name: '专业零售', level: 2, parentId: 'consumer_retail', subGraphId: 'consumer' },

    // Level 2: Service
    { id: 'consumer_catering', type: 'consumer_l2', name: '连锁餐饮', level: 2, parentId: 'consumer_service', subGraphId: 'consumer' },
    { id: 'consumer_hotel', type: 'consumer_l2', name: '酒店', level: 2, parentId: 'consumer_service', subGraphId: 'consumer' },
    { id: 'consumer_tourism', type: 'consumer_l2', name: '旅游', level: 2, parentId: 'consumer_service', subGraphId: 'consumer' },
  ]

  for (const node of consumerNodes) {
    await prisma.graphNode.upsert({
      where: { id: node.id },
      update: {},
      create: node,
    })
  }

  console.log('✅ 消费子图节点创建完成 (16节点)')

  // ==================== 创建用户 ====================
  const user = await prisma.user.upsert({
    where: { email: 'demo@example.com' },
    update: {},
    create: {
      email: 'demo@example.com',
      name: '演示用户',
      password: '$2b$10$demo.hashed.password', // 实际使用时需要加密
      settings: {
        create: {
          riskProfile: 'moderate',
          investHorizon: 'medium',
          totalAssets: 1000000,
          cashRatio: 0.2,
        },
      },
    },
  })
  console.log('用户创建完成:', user.email)

  // ==================== 创建投资组合 ====================
  // 查找或创建投资组合
  let portfolio = await prisma.portfolio.findFirst({
    where: {
      userId: user.id,
      name: '默认组合',
    },
  })

  if (!portfolio) {
    portfolio = await prisma.portfolio.create({
      data: {
        userId: user.id,
        name: '默认组合',
        isDefault: true,
      },
    })
  }

  // 创建持仓
  const holdings = [
    { ticker: '510300', name: '沪深300ETF', quantity: 10000, unitNav: 4.25 },
    { ticker: '512480', name: '半导体ETF', quantity: 5000, unitNav: 1.85 },
    { ticker: '588000', name: '科创50ETF', quantity: 8000, unitNav: 1.12 },
    { ticker: '515880', name: '通信ETF', quantity: 3000, unitNav: 1.45 },
  ]

  for (const holding of holdings) {
    await prisma.holding.create({
      data: {
        portfolioId: portfolio.id,
        market: 'A',
        ...holding,
      },
    })
  }
  console.log('投资组合创建完成')

  // ==================== 创建知识图谱节点 ====================
  console.log('开始创建知识图谱...')

  // 指数节点
  const indexNodes = await Promise.all([
    prisma.graphNode.create({
      data: {
        type: 'index',
        name: '沪深300',
        description: '沪深300指数',
        level: 0,
        metadata: JSON.stringify({
          trackingETFs: [
            { ticker: '510300', name: '沪深300ETF', totalAssets: 800, trackingError: 0.05 },
            { ticker: '159919', name: '沪深300ETF(易方达)', totalAssets: 500, trackingError: 0.06 },
          ],
        }),
      },
    }),
    prisma.graphNode.create({
      data: {
        type: 'index',
        name: '科创50',
        description: '科创板50指数',
        level: 0,
        metadata: JSON.stringify({
          trackingETFs: [
            { ticker: '588000', name: '科创50ETF', totalAssets: 600, trackingError: 0.08 },
          ],
        }),
      },
    }),
  ])

  // 一级行业节点
  const l1Nodes = await Promise.all([
    prisma.graphNode.create({
      data: {
        type: 'industry_l1',
        name: '信息技术',
        description: '信息技术行业',
        parentId: indexNodes[0].id,
        level: 1,
      },
    }),
    prisma.graphNode.create({
      data: {
        type: 'industry_l1',
        name: '通信设备',
        description: '通信设备行业',
        parentId: indexNodes[0].id,
        level: 1,
      },
    }),
  ])

  // 二级行业节点
  const l2Nodes = await Promise.all([
    prisma.graphNode.create({
      data: {
        type: 'industry_l2',
        name: '半导体',
        description: '半导体行业',
        parentId: l1Nodes[0].id,
        level: 2,
        metadata: JSON.stringify({
          trackingETFs: [
            { ticker: '512480', name: '半导体ETF', totalAssets: 300, trackingError: 0.1 },
            { ticker: '159995', name: '芯片ETF', totalAssets: 250, trackingError: 0.12 },
          ],
        }),
      },
    }),
    prisma.graphNode.create({
      data: {
        type: 'industry_l2',
        name: '光通信',
        description: '光通信行业',
        parentId: l1Nodes[1].id,
        level: 2,
        metadata: JSON.stringify({
          trackingETFs: [
            { ticker: '159853', name: '光通信ETF', totalAssets: 100, trackingError: 0.15 },
          ],
        }),
      },
    }),
  ])

  // 细分领域节点
  const subNodes = await Promise.all([
    prisma.graphNode.create({
      data: {
        type: 'sub_sector',
        name: '封测',
        description: '封装测试',
        parentId: l2Nodes[0].id,
        level: 3,
      },
    }),
    prisma.graphNode.create({
      data: {
        type: 'sub_sector',
        name: '设备',
        description: '半导体设备',
        parentId: l2Nodes[0].id,
        level: 3,
      },
    }),
    prisma.graphNode.create({
      data: {
        type: 'sub_sector',
        name: '光模块',
        description: '光模块',
        parentId: l2Nodes[1].id,
        level: 3,
      },
    }),
  ])

  // 产业链节点
  const chainNodes = await Promise.all([
    prisma.graphNode.create({
      data: {
        type: 'chip_design',
        name: 'GPU/AI芯片',
        description: 'GPU和AI专用芯片设计',
        level: 3,
        cyclePos: 'upturn',
        momentum: 85,
      },
    }),
    prisma.graphNode.create({
      data: {
        type: 'memory',
        name: 'HBM高带宽内存',
        description: '高带宽内存',
        level: 3,
        cyclePos: 'upturn',
        momentum: 90,
      },
    }),
    prisma.graphNode.create({
      data: {
        type: 'server',
        name: 'AI服务器',
        description: 'AI服务器制造',
        level: 3,
        cyclePos: 'upturn',
        momentum: 75,
      },
    }),
    prisma.graphNode.create({
      data: {
        type: 'cooling',
        name: '液冷散热',
        description: '液冷散热方案',
        level: 3,
        cyclePos: 'upturn',
        momentum: 80,
      },
    }),
    prisma.graphNode.create({
      data: {
        type: 'optical_module',
        name: '光模块',
        description: '高速光模块',
        level: 3,
        cyclePos: 'upturn',
        momentum: 78,
      },
    }),
    prisma.graphNode.create({
      data: {
        type: 'cpo',
        name: 'CPO',
        description: '光电共封装技术',
        level: 3,
        cyclePos: 'trough',
        momentum: 45,
      },
    }),
  ])

  // 创建关系
  const edges = [
    // GPU → HBM
    { sourceId: chainNodes[0].id, targetId: chainNodes[1].id, relation: 'demand_driver', weight: 0.9, direction: 'positive', lag: '即时', confidence: 0.95 },
    // GPU → 服务器
    { sourceId: chainNodes[0].id, targetId: chainNodes[2].id, relation: 'demand_driver', weight: 0.85, direction: 'positive', lag: '1-3月', confidence: 0.9 },
    // 服务器 → 液冷
    { sourceId: chainNodes[2].id, targetId: chainNodes[3].id, relation: 'demand_driver', weight: 0.8, direction: 'positive', lag: '1-3月', confidence: 0.85 },
    // GPU → 光模块
    { sourceId: chainNodes[0].id, targetId: chainNodes[4].id, relation: 'demand_driver', weight: 0.7, direction: 'positive', lag: '1-3月', confidence: 0.8 },
    // 光模块 → CPO
    { sourceId: chainNodes[4].id, targetId: chainNodes[5].id, relation: 'tech_enable', weight: 0.6, direction: 'positive', lag: '3-6月', confidence: 0.7 },
    // 半导体 → 封测
    { sourceId: l2Nodes[0].id, targetId: subNodes[0].id, relation: 'supply_chain', weight: 0.9, direction: 'positive', lag: '即时', confidence: 0.95 },
    // 半导体 → 设备
    { sourceId: l2Nodes[0].id, targetId: subNodes[1].id, relation: 'supply_chain', weight: 0.85, direction: 'positive', lag: '即时', confidence: 0.9 },
  ]

  for (const edge of edges) {
    await prisma.graphEdge.create({ data: edge })
  }

  // 关联个股
  const stocks = [
    { nodeId: subNodes[0].id, stockCode: '600584', stockName: '长电科技' },
    { nodeId: subNodes[0].id, stockCode: '002156', stockName: '通富微电' },
    { nodeId: subNodes[1].id, stockCode: '002371', stockName: '北方华创' },
    { nodeId: subNodes[1].id, stockCode: '688012', stockName: '中微公司' },
    { nodeId: subNodes[2].id, stockCode: '300308', stockName: '中际旭创' },
    { nodeId: subNodes[2].id, stockCode: '300502', stockName: '新易盛' },
    { nodeId: chainNodes[3].id, stockCode: '002837', stockName: '英维克' },
  ]

  for (const stock of stocks) {
    await prisma.graphStock.upsert({
      where: {
        nodeId_stockCode: {
          nodeId: stock.nodeId,
          stockCode: stock.stockCode,
        },
      },
      update: {},
      create: stock,
    })
  }

  console.log('知识图谱创建完成')

  // ==================== 创建跨行业边 ====================
  console.log('开始创建跨行业边...')

  const crossGraphEdges = [
    {
      id: 'edge_cross_1',
      sourceId: chainNodes[0].id, // AI芯片
      targetId: 'nev_compute',  // 智驾计算平台
      relation: 'demand_driver',
      weight: 0.8,
      direction: 'positive',
      lag: '短期',
      confidence: 0.85,
      description: 'AI芯片需求驱动智能驾驶计算平台',
      isCrossGraph: true,
    },
    {
      id: 'edge_cross_2',
      sourceId: 'nev_battery', // 动力电池
      targetId: 'nev_charging', // 充电桩
      relation: 'complement',
      weight: 0.9,
      direction: 'positive',
      lag: '短期',
      confidence: 0.9,
      description: '电池技术进步推动充电桩需求',
      isCrossGraph: false, // Same subgraph but different L1
    },
    {
      id: 'edge_cross_3',
      sourceId: 'consumer_ecommerce', // 电商平台
      targetId: 'consumer_food',      // 食品饮料
      relation: 'demand_driver',
      weight: 0.7,
      direction: 'positive',
      lag: '即时',
      confidence: 0.8,
      description: '电商平台流量驱动食品饮料销售',
      isCrossGraph: false, // Same subgraph
    },
  ]

  for (const edge of crossGraphEdges) {
    await prisma.graphEdge.upsert({
      where: { id: edge.id },
      update: {},
      create: edge,
    })
  }

  console.log('✅ 跨行业边创建完成')

  console.log('种子数据初始化完成!')
}

main()
  .then(async () => {
    await prisma.$disconnect()
  })
  .catch(async (e) => {
    console.error(e)
    await prisma.$disconnect()
    process.exit(1)
  })
