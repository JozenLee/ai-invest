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

  // ==================== 创建用户 ====================
  const user = await prisma.user.create({
    data: {
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
  const portfolio = await prisma.portfolio.create({
    data: {
      userId: user.id,
      name: '默认组合',
      isDefault: true,
    },
  })

  // 创建持仓
  const holdings = [
    { ticker: '510300', name: '沪深300ETF', quantity: 10000, avgCost: 4.25 },
    { ticker: '512480', name: '半导体ETF', quantity: 5000, avgCost: 1.85 },
    { ticker: '588000', name: '科创50ETF', quantity: 8000, avgCost: 1.12 },
    { ticker: '515880', name: '通信ETF', quantity: 3000, avgCost: 1.45 },
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
    { nodeId: subNodes[0].id, ticker: '600584', market: 'A', name: '长电科技', relevance: 0.95, role: 'direct' },
    { nodeId: subNodes[0].id, ticker: '002156', market: 'A', name: '通富微电', relevance: 0.85, role: 'direct' },
    { nodeId: subNodes[1].id, ticker: '002371', market: 'A', name: '北方华创', relevance: 0.9, role: 'direct' },
    { nodeId: subNodes[1].id, ticker: '688012', market: 'A', name: '中微公司', relevance: 0.85, role: 'direct' },
    { nodeId: subNodes[2].id, ticker: '300308', market: 'A', name: '中际旭创', relevance: 0.95, role: 'direct' },
    { nodeId: subNodes[2].id, ticker: '300502', market: 'A', name: '新易盛', relevance: 0.9, role: 'direct' },
    { nodeId: chainNodes[3].id, ticker: '002837', market: 'A', name: '英维克', relevance: 0.9, role: 'direct' },
  ]

  for (const stock of stocks) {
    await prisma.graphStock.create({ data: stock })
  }

  console.log('知识图谱创建完成')
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
