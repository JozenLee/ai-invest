import { PrismaClient } from '@prisma/client'
import { PrismaBetterSqlite3 } from '@prisma/adapter-better-sqlite3'
import path from 'path'

const dbPath = path.resolve(__dirname, '../prisma/dev.db')
const adapter = new PrismaBetterSqlite3({
  url: `file:${dbPath}`,
})
const prisma = new PrismaClient({ adapter })

async function main() {
  console.log('开始构建AI硬件产业链知识图谱...')

  // 清空现有图谱数据
  console.log('清空现有图谱数据...')
  await prisma.graphStock.deleteMany()
  await prisma.graphEdge.deleteMany()
  await prisma.graphChangeLog.deleteMany()
  await prisma.graphNode.deleteMany()

  // ==================== 第一层：指数节点 ====================
  console.log('创建指数节点...')
  const indexNodes = await Promise.all([
    prisma.graphNode.create({
      data: {
        type: 'index',
        name: '沪深300',
        description: '沪深300指数，反映A股大盘蓝筹股整体表现',
        level: 0,
        metadata: JSON.stringify({
          trackingETFs: [
            { ticker: '510300', name: '沪深300ETF' },
            { ticker: '159919', name: '沪深300ETF(易方达)' },
          ],
        }),
      },
    }),
    prisma.graphNode.create({
      data: {
        type: 'index',
        name: '科创50',
        description: '科创板50指数，反映科创板龙头企业表现',
        level: 0,
        metadata: JSON.stringify({
          trackingETFs: [
            { ticker: '588000', name: '科创50ETF' },
          ],
        }),
      },
    }),
    prisma.graphNode.create({
      data: {
        type: 'index',
        name: '中证半导体',
        description: '中证全指半导体指数，反映半导体行业整体表现',
        level: 0,
        metadata: JSON.stringify({
          trackingETFs: [
            { ticker: '512480', name: '半导体ETF' },
            { ticker: '159995', name: '芯片ETF' },
          ],
        }),
      },
    }),
    prisma.graphNode.create({
      data: {
        type: 'index',
        name: '中证人工智能',
        description: '中证人工智能主题指数，反映AI产业链表现',
        level: 0,
        metadata: JSON.stringify({
          trackingETFs: [
            { ticker: '515070', name: 'AI ETF' },
          ],
        }),
      },
    }),
    prisma.graphNode.create({
      data: {
        type: 'index',
        name: '中证通信设备',
        description: '中证全指通信设备指数，反映通信设备行业表现',
        level: 0,
        metadata: JSON.stringify({
          trackingETFs: [
            { ticker: '515880', name: '通信ETF' },
          ],
        }),
      },
    }),
  ])

  // ==================== 第二层：一级行业节点 ====================
  console.log('创建一级行业节点...')
  const l1Nodes = await Promise.all([
    prisma.graphNode.create({
      data: {
        type: 'industry_l1',
        name: '半导体',
        description: '半导体产业链，包括芯片设计、制造、封测等环节',
        parentId: indexNodes[2].id,
        level: 1,
        cyclePos: 'upturn',
        momentum: 85,
      },
    }),
    prisma.graphNode.create({
      data: {
        type: 'industry_l1',
        name: '通信设备',
        description: '通信设备产业链，包括光通信、网络设备等',
        parentId: indexNodes[4].id,
        level: 1,
        cyclePos: 'upturn',
        momentum: 75,
      },
    }),
    prisma.graphNode.create({
      data: {
        type: 'industry_l1',
        name: '计算机',
        description: '计算机产业链，包括服务器、存储、软件等',
        parentId: indexNodes[0].id,
        level: 1,
        cyclePos: 'upturn',
        momentum: 70,
      },
    }),
    prisma.graphNode.create({
      data: {
        type: 'industry_l1',
        name: '电子',
        description: '电子产业链，包括消费电子、元器件等',
        parentId: indexNodes[0].id,
        level: 1,
        cyclePos: 'upturn',
        momentum: 65,
      },
    }),
  ])

  // ==================== 第三层：二级行业节点 ====================
  console.log('创建二级行业节点...')
  const l2Nodes = await Promise.all([
    // 半导体细分
    prisma.graphNode.create({
      data: {
        type: 'industry_l2',
        name: '芯片设计',
        description: '芯片设计环节，包括GPU、CPU、AI芯片等',
        parentId: l1Nodes[0].id,
        level: 2,
        cyclePos: 'upturn',
        momentum: 90,
      },
    }),
    prisma.graphNode.create({
      data: {
        type: 'industry_l2',
        name: '晶圆代工',
        description: '晶圆代工制造环节',
        parentId: l1Nodes[0].id,
        level: 2,
        cyclePos: 'upturn',
        momentum: 80,
      },
    }),
    prisma.graphNode.create({
      data: {
        type: 'industry_l2',
        name: '封装测试',
        description: '芯片封装测试环节',
        parentId: l1Nodes[0].id,
        level: 2,
        cyclePos: 'upturn',
        momentum: 75,
      },
    }),
    prisma.graphNode.create({
      data: {
        type: 'industry_l2',
        name: '半导体设备',
        description: '半导体制造设备',
        parentId: l1Nodes[0].id,
        level: 2,
        cyclePos: 'upturn',
        momentum: 85,
      },
    }),
    prisma.graphNode.create({
      data: {
        type: 'industry_l2',
        name: '半导体材料',
        description: '半导体制造材料',
        parentId: l1Nodes[0].id,
        level: 2,
        cyclePos: 'upturn',
        momentum: 70,
      },
    }),
    prisma.graphNode.create({
      data: {
        type: 'industry_l2',
        name: 'EDA',
        description: '电子设计自动化工具',
        parentId: l1Nodes[0].id,
        level: 2,
        cyclePos: 'upturn',
        momentum: 65,
      },
    }),
    prisma.graphNode.create({
      data: {
        type: 'industry_l2',
        name: '存储芯片',
        description: '存储芯片，包括DRAM、NAND、HBM等',
        parentId: l1Nodes[0].id,
        level: 2,
        cyclePos: 'upturn',
        momentum: 88,
      },
    }),
    // 通信设备细分
    prisma.graphNode.create({
      data: {
        type: 'industry_l2',
        name: '光通信',
        description: '光通信产业链，包括光模块、光纤等',
        parentId: l1Nodes[1].id,
        level: 2,
        cyclePos: 'upturn',
        momentum: 82,
      },
    }),
    prisma.graphNode.create({
      data: {
        type: 'industry_l2',
        name: '网络设备',
        description: '网络设备，包括交换机、路由器等',
        parentId: l1Nodes[1].id,
        level: 2,
        cyclePos: 'upturn',
        momentum: 72,
      },
    }),
    // 计算机细分
    prisma.graphNode.create({
      data: {
        type: 'industry_l2',
        name: '服务器',
        description: '服务器制造，包括AI服务器、通用服务器等',
        parentId: l1Nodes[2].id,
        level: 2,
        cyclePos: 'upturn',
        momentum: 78,
      },
    }),
    prisma.graphNode.create({
      data: {
        type: 'industry_l2',
        name: '存储设备',
        description: '存储设备，包括企业级存储、SSD等',
        parentId: l1Nodes[2].id,
        level: 2,
        cyclePos: 'upturn',
        momentum: 70,
      },
    }),
    prisma.graphNode.create({
      data: {
        type: 'industry_l2',
        name: '云计算',
        description: '云计算服务，包括IaaS、PaaS、SaaS等',
        parentId: l1Nodes[2].id,
        level: 2,
        cyclePos: 'upturn',
        momentum: 75,
      },
    }),
    // 电子细分
    prisma.graphNode.create({
      data: {
        type: 'industry_l2',
        name: 'PCB',
        description: '印制电路板，包括高多层板、HDI等',
        parentId: l1Nodes[3].id,
        level: 2,
        cyclePos: 'upturn',
        momentum: 68,
      },
    }),
    prisma.graphNode.create({
      data: {
        type: 'industry_l2',
        name: '被动元件',
        description: '被动元件，包括电容、电阻、电感等',
        parentId: l1Nodes[3].id,
        level: 2,
        cyclePos: 'upturn',
        momentum: 60,
      },
    }),
  ])

  // ==================== 第四层：细分领域节点 ====================
  console.log('创建细分领域节点...')
  const subNodes = await Promise.all([
    // GPU/AI芯片
    prisma.graphNode.create({
      data: {
        type: 'chip_design',
        name: 'GPU/AI芯片',
        description: 'GPU和AI专用芯片设计，包括训练芯片和推理芯片',
        parentId: l2Nodes[0].id,
        level: 3,
        cyclePos: 'upturn',
        momentum: 92,
      },
    }),
    // CPU
    prisma.graphNode.create({
      data: {
        type: 'chip_design',
        name: 'CPU',
        description: '中央处理器，包括服务器CPU和桌面CPU',
        parentId: l2Nodes[0].id,
        level: 3,
        cyclePos: 'upturn',
        momentum: 75,
      },
    }),
    // FPGA
    prisma.graphNode.create({
      data: {
        type: 'chip_design',
        name: 'FPGA',
        description: '现场可编程门阵列，用于AI推理加速',
        parentId: l2Nodes[0].id,
        level: 3,
        cyclePos: 'upturn',
        momentum: 65,
      },
    }),
    // HBM
    prisma.graphNode.create({
      data: {
        type: 'memory',
        name: 'HBM高带宽内存',
        description: '高带宽内存，用于AI芯片的高速数据传输',
        parentId: l2Nodes[6].id,
        level: 3,
        cyclePos: 'upturn',
        momentum: 95,
      },
    }),
    // DRAM
    prisma.graphNode.create({
      data: {
        type: 'memory',
        name: 'DRAM',
        description: '动态随机存取存储器',
        parentId: l2Nodes[6].id,
        level: 3,
        cyclePos: 'upturn',
        momentum: 70,
      },
    }),
    // NAND
    prisma.graphNode.create({
      data: {
        type: 'memory',
        name: 'NAND Flash',
        description: '闪存存储芯片',
        parentId: l2Nodes[6].id,
        level: 3,
        cyclePos: 'upturn',
        momentum: 65,
      },
    }),
    // 光模块
    prisma.graphNode.create({
      data: {
        type: 'optical_module',
        name: '光模块',
        description: '高速光模块，用于数据中心互联，包括400G、800G等',
        parentId: l2Nodes[7].id,
        level: 3,
        cyclePos: 'upturn',
        momentum: 85,
      },
    }),
    // CPO
    prisma.graphNode.create({
      data: {
        type: 'cpo',
        name: 'CPO光电共封装',
        description: '光电共封装技术，下一代光通信技术',
        parentId: l2Nodes[7].id,
        level: 3,
        cyclePos: 'trough',
        momentum: 45,
      },
    }),
    // AI服务器
    prisma.graphNode.create({
      data: {
        type: 'server',
        name: 'AI服务器',
        description: 'AI训练和推理服务器，搭载GPU/AI芯片',
        parentId: l2Nodes[9].id,
        level: 3,
        cyclePos: 'upturn',
        momentum: 82,
      },
    }),
    // 通用服务器
    prisma.graphNode.create({
      data: {
        type: 'server',
        name: '通用服务器',
        description: '通用计算服务器',
        parentId: l2Nodes[9].id,
        level: 3,
        cyclePos: 'upturn',
        momentum: 65,
      },
    }),
    // 液冷散热
    prisma.graphNode.create({
      data: {
        type: 'cooling',
        name: '液冷散热',
        description: '液冷散热方案，用于高功耗AI服务器',
        parentId: l2Nodes[9].id,
        level: 3,
        cyclePos: 'upturn',
        momentum: 80,
      },
    }),
    // 风冷散热
    prisma.graphNode.create({
      data: {
        type: 'cooling',
        name: '风冷散热',
        description: '传统风冷散热方案',
        parentId: l2Nodes[9].id,
        level: 3,
        cyclePos: 'upturn',
        momentum: 55,
      },
    }),
    // 电源
    prisma.graphNode.create({
      data: {
        type: 'power',
        name: '服务器电源',
        description: '服务器电源模块，高功率密度电源',
        parentId: l2Nodes[9].id,
        level: 3,
        cyclePos: 'upturn',
        momentum: 70,
      },
    }),
    // PCB高多层板
    prisma.graphNode.create({
      data: {
        type: 'pcb',
        name: '高多层PCB',
        description: '高多层印制电路板，用于服务器、交换机等',
        parentId: l2Nodes[12].id,
        level: 3,
        cyclePos: 'upturn',
        momentum: 72,
      },
    }),
    // 数据中心
    prisma.graphNode.create({
      data: {
        type: 'data_center',
        name: '数据中心',
        description: '数据中心基础设施，包括IDC、算力中心等',
        parentId: l2Nodes[11].id,
        level: 3,
        cyclePos: 'upturn',
        momentum: 78,
      },
    }),
    // AI应用
    prisma.graphNode.create({
      data: {
        type: 'ai_application',
        name: 'AI应用',
        description: 'AI应用层，包括大模型、AI软件等',
        parentId: l2Nodes[11].id,
        level: 3,
        cyclePos: 'upturn',
        momentum: 85,
      },
    }),
  ])

  // ==================== 创建关系 ====================
  console.log('创建节点关系...')
  const edges = [
    // 指数 → 一级行业
    { sourceId: indexNodes[2].id, targetId: l1Nodes[0].id, relation: 'contain', weight: 1.0, direction: 'positive', lag: '即时', confidence: 1.0, description: '中证半导体指数包含半导体行业' },
    { sourceId: indexNodes[4].id, targetId: l1Nodes[1].id, relation: 'contain', weight: 1.0, direction: 'positive', lag: '即时', confidence: 1.0, description: '中证通信设备指数包含通信设备行业' },
    { sourceId: indexNodes[0].id, targetId: l1Nodes[2].id, relation: 'contain', weight: 0.8, direction: 'positive', lag: '即时', confidence: 1.0, description: '沪深300指数包含计算机行业' },
    { sourceId: indexNodes[0].id, targetId: l1Nodes[3].id, relation: 'contain', weight: 0.8, direction: 'positive', lag: '即时', confidence: 1.0, description: '沪深300指数包含电子行业' },

    // 一级行业 → 二级行业
    { sourceId: l1Nodes[0].id, targetId: l2Nodes[0].id, relation: 'contain', weight: 1.0, direction: 'positive', lag: '即时', confidence: 1.0, description: '半导体行业包含芯片设计' },
    { sourceId: l1Nodes[0].id, targetId: l2Nodes[1].id, relation: 'contain', weight: 1.0, direction: 'positive', lag: '即时', confidence: 1.0, description: '半导体行业包含晶圆代工' },
    { sourceId: l1Nodes[0].id, targetId: l2Nodes[2].id, relation: 'contain', weight: 1.0, direction: 'positive', lag: '即时', confidence: 1.0, description: '半导体行业包含封装测试' },
    { sourceId: l1Nodes[0].id, targetId: l2Nodes[3].id, relation: 'contain', weight: 1.0, direction: 'positive', lag: '即时', confidence: 1.0, description: '半导体行业包含半导体设备' },
    { sourceId: l1Nodes[0].id, targetId: l2Nodes[4].id, relation: 'contain', weight: 1.0, direction: 'positive', lag: '即时', confidence: 1.0, description: '半导体行业包含半导体材料' },
    { sourceId: l1Nodes[0].id, targetId: l2Nodes[5].id, relation: 'contain', weight: 1.0, direction: 'positive', lag: '即时', confidence: 1.0, description: '半导体行业包含EDA' },
    { sourceId: l1Nodes[0].id, targetId: l2Nodes[6].id, relation: 'contain', weight: 1.0, direction: 'positive', lag: '即时', confidence: 1.0, description: '半导体行业包含存储芯片' },
    { sourceId: l1Nodes[1].id, targetId: l2Nodes[7].id, relation: 'contain', weight: 1.0, direction: 'positive', lag: '即时', confidence: 1.0, description: '通信设备行业包含光通信' },
    { sourceId: l1Nodes[1].id, targetId: l2Nodes[8].id, relation: 'contain', weight: 1.0, direction: 'positive', lag: '即时', confidence: 1.0, description: '通信设备行业包含网络设备' },
    { sourceId: l1Nodes[2].id, targetId: l2Nodes[9].id, relation: 'contain', weight: 1.0, direction: 'positive', lag: '即时', confidence: 1.0, description: '计算机行业包含服务器' },
    { sourceId: l1Nodes[2].id, targetId: l2Nodes[10].id, relation: 'contain', weight: 1.0, direction: 'positive', lag: '即时', confidence: 1.0, description: '计算机行业包含存储设备' },
    { sourceId: l1Nodes[2].id, targetId: l2Nodes[11].id, relation: 'contain', weight: 1.0, direction: 'positive', lag: '即时', confidence: 1.0, description: '计算机行业包含云计算' },
    { sourceId: l1Nodes[3].id, targetId: l2Nodes[12].id, relation: 'contain', weight: 1.0, direction: 'positive', lag: '即时', confidence: 1.0, description: '电子行业包含PCB' },
    { sourceId: l1Nodes[3].id, targetId: l2Nodes[13].id, relation: 'contain', weight: 1.0, direction: 'positive', lag: '即时', confidence: 1.0, description: '电子行业包含被动元件' },

    // 二级行业 → 细分领域
    { sourceId: l2Nodes[0].id, targetId: subNodes[0].id, relation: 'contain', weight: 1.0, direction: 'positive', lag: '即时', confidence: 1.0, description: '芯片设计包含GPU/AI芯片' },
    { sourceId: l2Nodes[0].id, targetId: subNodes[1].id, relation: 'contain', weight: 1.0, direction: 'positive', lag: '即时', confidence: 1.0, description: '芯片设计包含CPU' },
    { sourceId: l2Nodes[0].id, targetId: subNodes[2].id, relation: 'contain', weight: 1.0, direction: 'positive', lag: '即时', confidence: 1.0, description: '芯片设计包含FPGA' },
    { sourceId: l2Nodes[6].id, targetId: subNodes[3].id, relation: 'contain', weight: 1.0, direction: 'positive', lag: '即时', confidence: 1.0, description: '存储芯片包含HBM' },
    { sourceId: l2Nodes[6].id, targetId: subNodes[4].id, relation: 'contain', weight: 1.0, direction: 'positive', lag: '即时', confidence: 1.0, description: '存储芯片包含DRAM' },
    { sourceId: l2Nodes[6].id, targetId: subNodes[5].id, relation: 'contain', weight: 1.0, direction: 'positive', lag: '即时', confidence: 1.0, description: '存储芯片包含NAND' },
    { sourceId: l2Nodes[7].id, targetId: subNodes[6].id, relation: 'contain', weight: 1.0, direction: 'positive', lag: '即时', confidence: 1.0, description: '光通信包含光模块' },
    { sourceId: l2Nodes[7].id, targetId: subNodes[7].id, relation: 'contain', weight: 1.0, direction: 'positive', lag: '即时', confidence: 1.0, description: '光通信包含CPO' },
    { sourceId: l2Nodes[9].id, targetId: subNodes[8].id, relation: 'contain', weight: 1.0, direction: 'positive', lag: '即时', confidence: 1.0, description: '服务器包含AI服务器' },
    { sourceId: l2Nodes[9].id, targetId: subNodes[9].id, relation: 'contain', weight: 1.0, direction: 'positive', lag: '即时', confidence: 1.0, description: '服务器包含通用服务器' },
    { sourceId: l2Nodes[9].id, targetId: subNodes[10].id, relation: 'contain', weight: 0.8, direction: 'positive', lag: '即时', confidence: 0.9, description: '服务器产业链包含液冷散热' },
    { sourceId: l2Nodes[9].id, targetId: subNodes[11].id, relation: 'contain', weight: 0.6, direction: 'positive', lag: '即时', confidence: 0.9, description: '服务器产业链包含风冷散热' },
    { sourceId: l2Nodes[9].id, targetId: subNodes[12].id, relation: 'contain', weight: 0.7, direction: 'positive', lag: '即时', confidence: 0.9, description: '服务器产业链包含电源' },
    { sourceId: l2Nodes[12].id, targetId: subNodes[13].id, relation: 'contain', weight: 1.0, direction: 'positive', lag: '即时', confidence: 1.0, description: 'PCB包含高多层PCB' },
    { sourceId: l2Nodes[11].id, targetId: subNodes[14].id, relation: 'contain', weight: 1.0, direction: 'positive', lag: '即时', confidence: 1.0, description: '云计算包含数据中心' },
    { sourceId: l2Nodes[11].id, targetId: subNodes[15].id, relation: 'contain', weight: 1.0, direction: 'positive', lag: '即时', confidence: 1.0, description: '云计算包含AI应用' },

    // AI产业链核心传导关系
    // GPU/AI芯片 → HBM (强需求驱动)
    { sourceId: subNodes[0].id, targetId: subNodes[3].id, relation: 'demand_driver', weight: 0.95, direction: 'positive', lag: '即时', confidence: 0.95, description: 'AI芯片需要高带宽内存HBM进行高速数据传输' },
    // GPU/AI芯片 → AI服务器 (强需求驱动)
    { sourceId: subNodes[0].id, targetId: subNodes[8].id, relation: 'demand_driver', weight: 0.9, direction: 'positive', lag: '1-3月', confidence: 0.92, description: 'AI芯片需求推动AI服务器出货量增长' },
    // AI服务器 → 液冷散热 (需求驱动)
    { sourceId: subNodes[8].id, targetId: subNodes[10].id, relation: 'demand_driver', weight: 0.85, direction: 'positive', lag: '1-3月', confidence: 0.88, description: 'AI服务器高功耗推动液冷散热需求' },
    // AI服务器 → 电源 (需求驱动)
    { sourceId: subNodes[8].id, targetId: subNodes[12].id, relation: 'demand_driver', weight: 0.8, direction: 'positive', lag: '1-3月', confidence: 0.85, description: 'AI服务器高功耗推动电源需求' },
    // AI服务器 → 高多层PCB (需求驱动)
    { sourceId: subNodes[8].id, targetId: subNodes[13].id, relation: 'demand_driver', weight: 0.75, direction: 'positive', lag: '1-3月', confidence: 0.82, description: 'AI服务器推动高多层PCB需求' },
    // GPU/AI芯片 → 光模块 (需求驱动)
    { sourceId: subNodes[0].id, targetId: subNodes[6].id, relation: 'demand_driver', weight: 0.8, direction: 'positive', lag: '1-3月', confidence: 0.85, description: 'AI集群互联推动高速光模块需求' },
    // 光模块 → CPO (技术演进)
    { sourceId: subNodes[6].id, targetId: subNodes[7].id, relation: 'tech_evolution', weight: 0.7, direction: 'positive', lag: '3-6月', confidence: 0.7, description: '光模块技术向CPO演进' },
    // AI服务器 → 数据中心 (需求驱动)
    { sourceId: subNodes[8].id, targetId: subNodes[14].id, relation: 'demand_driver', weight: 0.85, direction: 'positive', lag: '1-3月', confidence: 0.9, description: 'AI服务器部署推动数据中心建设' },
    // 数据中心 → AI应用 (支撑关系)
    { sourceId: subNodes[14].id, targetId: subNodes[15].id, relation: 'support', weight: 0.9, direction: 'positive', lag: '即时', confidence: 0.9, description: '数据中心为AI应用提供算力支撑' },
    // AI应用 → GPU/AI芯片 (反向需求)
    { sourceId: subNodes[15].id, targetId: subNodes[0].id, relation: 'demand_driver', weight: 0.85, direction: 'positive', lag: '1-3月', confidence: 0.88, description: 'AI应用发展推动AI芯片需求' },

    // 供应链关系
    // 芯片设计 → 晶圆代工
    { sourceId: subNodes[0].id, targetId: l2Nodes[1].id, relation: 'supply_chain', weight: 0.9, direction: 'positive', lag: '即时', confidence: 0.95, description: '芯片设计需要晶圆代工制造' },
    // 晶圆代工 → 封装测试
    { sourceId: l2Nodes[1].id, targetId: l2Nodes[2].id, relation: 'supply_chain', weight: 0.9, direction: 'positive', lag: '即时', confidence: 0.95, description: '晶圆代工后需要封装测试' },
    // 晶圆代工 → 半导体设备
    { sourceId: l2Nodes[1].id, targetId: l2Nodes[3].id, relation: 'demand_driver', weight: 0.85, direction: 'positive', lag: '即时', confidence: 0.9, description: '晶圆代工需要半导体设备' },
    // 晶圆代工 → 半导体材料
    { sourceId: l2Nodes[1].id, targetId: l2Nodes[4].id, relation: 'demand_driver', weight: 0.8, direction: 'positive', lag: '即时', confidence: 0.9, description: '晶圆代工需要半导体材料' },
    // 芯片设计 → EDA
    { sourceId: subNodes[0].id, targetId: l2Nodes[5].id, relation: 'demand_driver', weight: 0.7, direction: 'positive', lag: '即时', confidence: 0.85, description: '芯片设计需要EDA工具' },
  ]

  for (const edge of edges) {
    await prisma.graphEdge.create({ data: edge })
  }

  // ==================== 关联个股 ====================
  console.log('关联个股...')
  const stocks = [
    // GPU/AI芯片相关
    { nodeId: subNodes[0].id, ticker: '688981', market: 'A', name: '中芯国际', relevance: 0.9, role: 'direct' },
    { nodeId: subNodes[0].id, ticker: '688041', market: 'A', name: '海光信息', relevance: 0.95, role: 'direct' },
    { nodeId: subNodes[0].id, ticker: '688256', market: 'A', name: '寒武纪', relevance: 0.95, role: 'direct' },

    // 晶圆代工相关
    { nodeId: l2Nodes[1].id, ticker: '688981', market: 'A', name: '中芯国际', relevance: 0.95, role: 'direct' },
    { nodeId: l2Nodes[1].id, ticker: '688012', market: 'A', name: '中微公司', relevance: 0.85, role: 'indirect' },

    // 封装测试相关
    { nodeId: l2Nodes[2].id, ticker: '600584', market: 'A', name: '长电科技', relevance: 0.95, role: 'direct' },
    { nodeId: l2Nodes[2].id, ticker: '002156', market: 'A', name: '通富微电', relevance: 0.9, role: 'direct' },
    { nodeId: l2Nodes[2].id, ticker: '002185', market: 'A', name: '华天科技', relevance: 0.85, role: 'direct' },

    // 半导体设备相关
    { nodeId: l2Nodes[3].id, ticker: '002371', market: 'A', name: '北方华创', relevance: 0.95, role: 'direct' },
    { nodeId: l2Nodes[3].id, ticker: '688012', market: 'A', name: '中微公司', relevance: 0.9, role: 'direct' },
    { nodeId: l2Nodes[3].id, ticker: '688072', market: 'A', name: '拓荆科技', relevance: 0.85, role: 'direct' },

    // 半导体材料相关
    { nodeId: l2Nodes[4].id, ticker: '688037', market: 'A', name: '芯源微', relevance: 0.8, role: 'direct' },
    { nodeId: l2Nodes[4].id, ticker: '300236', market: 'A', name: '上海新阳', relevance: 0.85, role: 'direct' },

    // HBM相关
    { nodeId: subNodes[3].id, ticker: '688981', market: 'A', name: '中芯国际', relevance: 0.8, role: 'indirect' },
    { nodeId: subNodes[3].id, ticker: '600584', market: 'A', name: '长电科技', relevance: 0.85, role: 'direct' },

    // 光模块相关
    { nodeId: subNodes[6].id, ticker: '300308', market: 'A', name: '中际旭创', relevance: 0.95, role: 'direct' },
    { nodeId: subNodes[6].id, ticker: '300502', market: 'A', name: '新易盛', relevance: 0.9, role: 'direct' },
    { nodeId: subNodes[6].id, ticker: '300393', market: 'A', name: '中来股份', relevance: 0.8, role: 'direct' },
    { nodeId: subNodes[6].id, ticker: '603083', market: 'A', name: '剑桥科技', relevance: 0.85, role: 'direct' },

    // AI服务器相关
    { nodeId: subNodes[8].id, ticker: '000977', market: 'A', name: '浪潮信息', relevance: 0.95, role: 'direct' },
    { nodeId: subNodes[8].id, ticker: '603019', market: 'A', name: '中科曙光', relevance: 0.9, role: 'direct' },
    { nodeId: subNodes[8].id, ticker: '002415', market: 'A', name: '海康威视', relevance: 0.7, role: 'indirect' },

    // 液冷散热相关
    { nodeId: subNodes[10].id, ticker: '002837', market: 'A', name: '英维克', relevance: 0.95, role: 'direct' },
    { nodeId: subNodes[10].id, ticker: '603444', market: 'A', name: '吉比特', relevance: 0.7, role: 'indirect' },

    // 高多层PCB相关
    { nodeId: subNodes[13].id, ticker: '002916', market: 'A', name: '深南电路', relevance: 0.95, role: 'direct' },
    { nodeId: subNodes[13].id, ticker: '603228', market: 'A', name: '景旺电子', relevance: 0.85, role: 'direct' },
    { nodeId: subNodes[13].id, ticker: '300408', market: 'A', name: '三环集团', relevance: 0.8, role: 'direct' },

    // 数据中心相关
    { nodeId: subNodes[14].id, ticker: '603881', market: 'A', name: '数据港', relevance: 0.9, role: 'direct' },
    { nodeId: subNodes[14].id, ticker: '300827', market: 'A', name: '上能电气', relevance: 0.8, role: 'indirect' },
  ]

  for (const stock of stocks) {
    await prisma.graphStock.create({
      data: {
        stockCode: stock.ticker,
        stockName: stock.name,
        nodeId: stock.nodeId,
        relevance: stock.relevance,
        category: stock.role,
      },
    })
  }

  // ==================== 创建变更日志 ====================
  console.log('创建变更日志...')
  await prisma.graphChangeLog.create({
    data: {
      action: 'add_node',
      reason: '初始化AI硬件产业链知识图谱',
      source: 'manual',
      approved: true,
    },
  })

  console.log('AI硬件产业链知识图谱构建完成!')
  console.log(`创建了 ${indexNodes.length} 个指数节点`)
  console.log(`创建了 ${l1Nodes.length} 个一级行业节点`)
  console.log(`创建了 ${l2Nodes.length} 个二级行业节点`)
  console.log(`创建了 ${subNodes.length} 个细分领域节点`)
  console.log(`创建了 ${edges.length} 条关系`)
  console.log(`关联了 ${stocks.length} 只个股`)
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
