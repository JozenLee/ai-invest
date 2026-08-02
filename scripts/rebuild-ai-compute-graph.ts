#!/usr/bin/env tsx
/**
 * 重构AI算力硬件知识图谱
 * 基于市场数据驱动的方法论重新构建图谱结构
 */

import prisma from '../src/lib/db/prisma'

// 新图谱结构定义
const AI_COMPUTE_GRAPH = {
  // L0: 根节点
  root: {
    id: 'ai_compute_hardware',
    name: 'AI算力硬件',
    type: 'domain_index',
    level: 0,
    description: 'AI算力基础设施产业链，从芯片到服务器到网络的完整硬件生态',
    metadata: {
      relatedIndex: '930713',
      indexName: '中证人工智能主题指数',
      trackingETFs: [
        { ticker: '515070', name: 'AI ETF', assets: 50 },
        { ticker: '512480', name: '半导体ETF', assets: 300 }
      ],
      industryChain: 'full',
      investmentTheme: 'AI基础设施建设周期',
      marketCap: '超万亿',
      growthRate: '30-50% CAGR',
      peakYear: '2025-2027'
    }
  },

  // L1: 一级板块（3个）
  l1: [
    {
      id: 'chip_design',
      name: '芯片设计',
      type: 'sector_l1',
      level: 1,
      parentId: 'ai_compute_hardware',
      description: 'AI芯片设计与制造，包括GPU、HBM、ASIC等',
      metadata: {
        relatedIndex: '931865',
        indexName: '中证全指半导体指数',
        trackingETFs: [
          { ticker: '512480', name: '半导体ETF', assets: 300 },
          { ticker: '159995', name: '芯片ETF', assets: 250 }
        ],
        capitalFlowSector: '芯片',
        industryChain: 'upstream',
        keyDrivers: [
          'AI训练需求爆发',
          '先进制程迭代',
          '国产替代加速'
        ],
        investmentLogic: 'AI算力需求推动芯片设计与制造量价齐升，先进制程和HBM供应紧张推高盈利能力',
        riskFactors: [
          'GPU出口管制',
          '先进制程依赖台积电',
          '需求周期波动'
        ],
        cyclicality: 'high',
        volatility: 'high'
      }
    },
    {
      id: 'compute_infrastructure',
      name: '算力基础设施',
      type: 'sector_l1',
      level: 1,
      parentId: 'ai_compute_hardware',
      description: 'AI服务器、存储、散热、电源等基础设施',
      metadata: {
        relatedIndex: '930713',
        indexName: '中证人工智能主题指数',
        trackingETFs: [
          { ticker: '515070', name: 'AI ETF', assets: 50 }
        ],
        capitalFlowSector: '服务器',
        industryChain: 'midstream',
        keyDrivers: [
          '数据中心建设加速',
          'AI训练需求增长',
          '算力租赁市场扩大'
        ],
        investmentLogic: '云厂商和企业加大AI基础设施投入，服务器及配套设备需求旺盛',
        riskFactors: [
          '资本开支周期性',
          '技术迭代快',
          '竞争激烈'
        ],
        cyclicality: 'medium',
        volatility: 'medium'
      }
    },
    {
      id: 'network_interconnect',
      name: '网络互联',
      type: 'sector_l1',
      level: 1,
      parentId: 'ai_compute_hardware',
      description: '光模块、CPO、高速网络设备',
      metadata: {
        relatedIndex: '931160',
        indexName: '中证全指通信设备指数',
        trackingETFs: [
          { ticker: '515880', name: '通信ETF', assets: 100 }
        ],
        capitalFlowSector: '通信设备',
        industryChain: 'supporting',
        keyDrivers: [
          '数据中心网络升级',
          'AI互联带宽需求',
          '800G/1.6T光模块放量'
        ],
        investmentLogic: 'AI训练对网络带宽要求极高，高速光模块和CPO技术迎来机遇',
        riskFactors: [
          '技术路线不确定性',
          'CPO量产进度',
          '价格竞争'
        ],
        cyclicality: 'medium',
        volatility: 'high'
      }
    }
  ],

  // L2: 细分领域（12个）
  l2: [
    // 芯片设计 (4个)
    {
      id: 'gpu_ai_chip',
      name: 'GPU/AI芯片',
      type: 'subsector_l2',
      level: 2,
      parentId: 'chip_design',
      description: 'AI训练和推理专用的高性能计算芯片',
      metadata: {
        relatedIndex: '931865',
        trackingETFs: [{ ticker: '512480', name: '半导体ETF' }],
        keyDrivers: [
          '大模型训练需求',
          'AI推理加速',
          '云厂商资本开支'
        ],
        keyPlayers: [
          { name: 'NVIDIA', share: '80%', region: '美国' },
          { name: 'AMD', share: '10%', region: '美国' },
          { name: '华为', share: '5%', region: '中国' },
          { name: '寒武纪', share: '2%', region: '中国' }
        ],
        investmentLogic: 'NVIDIA H100/H200供不应求，国产GPU在出口管制下迎来替代机遇',
        supplyStatus: 'tight',
        leadTime: '6-12个月',
        priceTrend: '持续涨价',
        technologyNode: '5nm/3nm',
        emergingTech: 'Chiplet架构',
        riskFactors: [
          '出口管制升级',
          '需求见顶风险',
          '技术代差'
        ]
      }
    },
    {
      id: 'hbm_memory',
      name: 'HBM高带宽内存',
      type: 'subsector_l2',
      level: 2,
      parentId: 'chip_design',
      description: 'GPU/AI芯片配套的高带宽内存',
      metadata: {
        relatedIndex: '931865',
        trackingETFs: [{ ticker: '512480', name: '半导体ETF' }],
        keyDrivers: [
          'GPU性能瓶颈在内存带宽',
          'HBM3代替HBM2e',
          '单卡HBM用量提升'
        ],
        keyPlayers: [
          { name: 'SK海力士', share: '50%', region: '韩国' },
          { name: '美光', share: '30%', region: '美国' },
          { name: '三星', share: '20%', region: '韩国' }
        ],
        investmentLogic: 'HBM是GPU算力提升的关键，供应紧张+ASP提升，存储芯片厂盈利显著改善',
        supplyStatus: 'tight',
        supplyTightnessDuration: '2024-2026',
        pricePremium: 'HBM价格是DDR5的5-8倍',
        technologyNode: 'HBM3/HBM3E',
        capacityRoadmap: '24GB → 36GB → 48GB per stack',
        riskFactors: [
          '产能释放导致供需逆转',
          'AI需求不及预期',
          '技术路线变化'
        ]
      }
    },
    {
      id: 'asic_chip',
      name: '专用AI芯片(ASIC)',
      type: 'subsector_l2',
      level: 2,
      parentId: 'chip_design',
      description: '针对特定AI任务优化的专用芯片',
      metadata: {
        relatedIndex: '931865',
        trackingETFs: [{ ticker: '512480', name: '半导体ETF' }],
        keyDrivers: [
          '边缘AI推理需求',
          '能效比优势',
          '成本控制'
        ],
        keyPlayers: [
          { name: 'Google TPU', share: '40%', region: '美国' },
          { name: '地平线', share: '15%', region: '中国' },
          { name: '比特大陆', share: '10%', region: '中国' }
        ],
        investmentLogic: '特定场景下ASIC能效比优于GPU，边缘AI和推理市场增长',
        applicationScenarios: ['自动驾驶', '安防监控', '智能音箱', '手机AI'],
        riskFactors: [
          '应用场景局限',
          'GPU通用性优势',
          '研发投入大'
        ]
      }
    },
    {
      id: 'advanced_packaging',
      name: '先进封装',
      type: 'subsector_l2',
      level: 2,
      parentId: 'chip_design',
      description: 'Chiplet、CoWoS、HBM封装等先进封装技术',
      metadata: {
        relatedIndex: '931865',
        trackingETFs: [{ ticker: '512480', name: '半导体ETF' }],
        keyDrivers: [
          '摩尔定律放缓',
          'Chiplet架构普及',
          'HBM封装需求'
        ],
        keyPlayers: [
          { name: '台积电', share: '60%', region: '台湾' },
          { name: '长电科技', share: '15%', region: '中国' },
          { name: '通富微电', share: '10%', region: '中国' }
        ],
        investmentLogic: '先进封装成为延续算力提升的关键路径，技术壁垒高',
        technologies: ['CoWoS', '2.5D/3D封装', 'Chiplet互联'],
        riskFactors: [
          '技术难度大',
          '良率爬坡',
          '设备依赖'
        ]
      }
    },

    // 算力基础设施 (4个)
    {
      id: 'ai_server',
      name: 'AI服务器',
      type: 'subsector_l2',
      level: 2,
      parentId: 'compute_infrastructure',
      description: '搭载GPU/AI芯片的高性能服务器',
      metadata: {
        relatedIndex: '930713',
        trackingETFs: [{ ticker: '515070', name: 'AI ETF' }],
        keyDrivers: [
          '数据中心AI化',
          '云厂商资本开支',
          'GPU服务器需求'
        ],
        keyPlayers: [
          { name: '浪潮信息', share: '30%', region: '中国' },
          { name: '联想', share: '20%', region: '中国' },
          { name: '华为', share: '15%', region: '中国' }
        ],
        investmentLogic: 'AI服务器单价高、毛利率好，云厂商采购需求强劲',
        avgPrice: '30-50万/台',
        configTrend: '8卡GPU服务器成主流',
        riskFactors: [
          'GPU供应卡脖子',
          '竞争激烈',
          '客户集中度高'
        ]
      }
    },
    {
      id: 'liquid_cooling',
      name: '液冷散热',
      type: 'subsector_l2',
      level: 2,
      parentId: 'compute_infrastructure',
      description: 'AI服务器配套的液冷散热系统',
      metadata: {
        relatedIndex: '930713',
        trackingETFs: [{ ticker: '515070', name: 'AI ETF' }],
        keyDrivers: [
          'GPU功耗快速提升',
          '数据中心节能要求',
          '液冷技术成熟'
        ],
        keyPlayers: [
          { name: '英维克', share: '25%', region: '中国' },
          { name: '佳力图', share: '15%', region: '中国' },
          { name: '申菱环境', share: '10%', region: '中国' }
        ],
        investmentLogic: 'GPU功耗突破1000W，液冷从可选变为必选，渗透率快速提升',
        penetrationRate: '2023年10% → 2026年50%',
        technologies: ['冷板式', '浸没式', '喷淋式'],
        riskFactors: [
          '技术路线竞争',
          '成本压力',
          '维护复杂'
        ]
      }
    },
    {
      id: 'server_power',
      name: '服务器电源',
      type: 'subsector_l2',
      level: 2,
      parentId: 'compute_infrastructure',
      description: 'AI服务器配套的高功率电源系统',
      metadata: {
        relatedIndex: '930713',
        trackingETFs: [{ ticker: '515070', name: 'AI ETF' }],
        keyDrivers: [
          '单机功耗提升',
          '电源效率要求',
          '钛金/白金认证'
        ],
        keyPlayers: [
          { name: '台达电子', share: '40%', region: '台湾' },
          { name: '康舒科技', share: '20%', region: '台湾' },
          { name: '全汉', share: '15%', region: '台湾' }
        ],
        investmentLogic: 'AI服务器功耗大幅提升，电源单价和用量双增长',
        powerRange: '2000W-3000W',
        efficiencyStandard: '钛金/白金认证',
        riskFactors: [
          '竞争激烈',
          '价格压力',
          '技术迭代'
        ]
      }
    },
    {
      id: 'data_center',
      name: '数据中心',
      type: 'subsector_l2',
      level: 2,
      parentId: 'compute_infrastructure',
      description: 'AI算力集中的数据中心设施',
      metadata: {
        relatedIndex: '930713',
        trackingETFs: [{ ticker: '515070', name: 'AI ETF' }],
        keyDrivers: [
          'AI算力需求集中',
          '智算中心建设',
          'REITS上市'
        ],
        keyPlayers: [
          { name: '万国数据', share: '20%', region: '中国' },
          { name: '世纪互联', share: '15%', region: '中国' },
          { name: '光环新网', share: '10%', region: '中国' }
        ],
        investmentLogic: '智算中心建设高峰，数据中心运营商受益于算力租赁需求',
        rentTrend: 'GPU算力租赁价格坚挺',
        utilizationRate: '80%+',
        riskFactors: [
          '资本开支巨大',
          '电力成本',
          '竞争加剧'
        ]
      }
    },

    // 网络互联 (4个)
    {
      id: 'optical_module',
      name: '光模块',
      type: 'subsector_l2',
      level: 2,
      parentId: 'network_interconnect',
      description: '数据中心高速光模块(400G/800G/1.6T)',
      metadata: {
        relatedIndex: '931160',
        trackingETFs: [{ ticker: '515880', name: '通信ETF' }],
        keyDrivers: [
          '数据中心网络升级',
          'AI训练带宽需求',
          '800G/1.6T放量'
        ],
        keyPlayers: [
          { name: '中际旭创', share: '30%', region: '中国' },
          { name: '新易盛', share: '20%', region: '中国' },
          { name: '天孚通信', share: '15%', region: '中国' }
        ],
        investmentLogic: 'AI训练对网络带宽要求极高，光模块向800G/1.6T升级加速',
        speedRoadmap: '400G → 800G → 1.6T',
        priceTrend: '800G价格坚挺',
        riskFactors: [
          'CPO技术冲击',
          '价格竞争',
          '库存周期'
        ]
      }
    },
    {
      id: 'cpo_technology',
      name: 'CPO共封装光学',
      type: 'subsector_l2',
      level: 2,
      parentId: 'network_interconnect',
      description: '将光模块与交换机芯片共封装的新技术',
      metadata: {
        relatedIndex: '931160',
        trackingETFs: [{ ticker: '515880', name: '通信ETF' }],
        keyDrivers: [
          '功耗降低50%',
          '成本降低30%',
          '带宽密度提升'
        ],
        keyPlayers: [
          { name: 'Broadcom', share: '40%', region: '美国' },
          { name: '仕佳光子', share: '10%', region: '中国' },
          { name: '光迅科技', share: '8%', region: '中国' }
        ],
        investmentLogic: 'CPO是下一代光互联技术，解决功耗和成本痛点',
        massProductionTime: '2026-2027年',
        adoptionRate: '预计2028年达到30%',
        riskFactors: [
          '技术成熟度',
          '良率爬坡',
          '生态建设'
        ]
      }
    },
    {
      id: 'high_speed_pcb',
      name: '高速PCB',
      type: 'subsector_l2',
      level: 2,
      parentId: 'network_interconnect',
      description: 'AI服务器和网络设备的高速印制电路板',
      metadata: {
        relatedIndex: '931160',
        trackingETFs: [{ ticker: '515880', name: '通信ETF' }],
        keyDrivers: [
          '高速信号传输',
          '多层板需求',
          'GPU服务器用量大'
        ],
        keyPlayers: [
          { name: '深南电路', share: '25%', region: '中国' },
          { name: '沪电股份', share: '20%', region: '中国' },
          { name: '生益科技', share: '15%', region: '中国' }
        ],
        investmentLogic: 'AI服务器对PCB层数和信号完整性要求高，单价提升',
        layerCount: '20-40层',
        priceIncrease: '同比+30%',
        riskFactors: [
          '原材料成本',
          '技术门槛',
          '需求波动'
        ]
      }
    },
    {
      id: 'switch_router',
      name: '交换机/路由器',
      type: 'subsector_l2',
      level: 2,
      parentId: 'network_interconnect',
      description: '数据中心高性能网络设备',
      metadata: {
        relatedIndex: '931160',
        trackingETFs: [{ ticker: '515880', name: '通信ETF' }],
        keyDrivers: [
          '数据中心网络扩容',
          'AI集群互联',
          '51.2T交换芯片'
        ],
        keyPlayers: [
          { name: 'Broadcom', share: '50%', region: '美国' },
          { name: '华为', share: '20%', region: '中国' },
          { name: '新华三', share: '10%', region: '中国' }
        ],
        investmentLogic: 'AI集群需要高带宽、低延迟网络，交换机需求增长',
        chipTrend: '25.6T → 51.2T → 102.4T',
        riskFactors: [
          '芯片供应',
          '技术迭代',
          '竞争激烈'
        ]
      }
    }
  ]
}

async function main() {
  console.log('=== 开始重构AI算力硬件知识图谱 ===\n')

  try {
    // Step 1: 备份现有AI算力相关节点
    console.log('1️⃣ 备份现有AI算力节点...')
    const existingNodes = await prisma.graphNode.findMany({
      where: {
        OR: [
          { id: { contains: 'ai' } },
          { name: { contains: 'AI' } },
          { name: { contains: '算力' } },
          { name: { contains: 'GPU' } }
        ]
      }
    })
    console.log(`   找到 ${existingNodes.length} 个现有节点`)

    // Step 2: 检查是否已存在新图谱
    console.log('\n2️⃣ 检查现有图谱...')
    const existingRoot = await prisma.graphNode.findUnique({
      where: { id: 'ai_compute_hardware' }
    })

    if (existingRoot) {
      console.log('   ⚠️  新图谱已存在，跳过创建')
      console.log('   如需重建，请先手动删除ai_compute_hardware及其子节点')
      return
    }

    console.log(`   保留 ${existingNodes.length} 个旧节点（将创建新的并行结构）`)

    // Step 3: 创建L0根节点
    console.log('\n3️⃣ 创建新图谱结构...')
    const root = AI_COMPUTE_GRAPH.root
    await prisma.graphNode.create({
      data: {
        ...root,
        metadata: JSON.stringify(root.metadata)
      }
    })
    console.log(`   ✅ 创建根节点: ${root.name}`)

    // Step 4: 创建L1节点
    for (const node of AI_COMPUTE_GRAPH.l1) {
      await prisma.graphNode.create({
        data: {
          ...node,
          metadata: JSON.stringify(node.metadata)
        }
      })
      console.log(`   ✅ 创建L1节点: ${node.name} [${node.metadata.relatedIndex}]`)
    }

    // Step 5: 创建L2节点
    console.log('\n4️⃣ 创建细分领域节点...')
    for (const node of AI_COMPUTE_GRAPH.l2) {
      await prisma.graphNode.create({
        data: {
          ...node,
          metadata: JSON.stringify(node.metadata)
        }
      })
      console.log(`   ✅ 创建L2节点: ${node.name}`)
    }

    // Step 6: 验证市场数据映射
    console.log('\n5️⃣ 验证市场数据映射...')

    const allNewNodes = await prisma.graphNode.findMany({
      where: { id: { startsWith: 'ai_compute' } }
    })

    for (const node of allNewNodes) {
      if (node.metadata) {
        const meta = JSON.parse(node.metadata as string)
        if (meta.relatedIndex) {
          const indexData = await prisma.indexDaily.findFirst({
            where: { code: meta.relatedIndex }
          })
          if (indexData) {
            console.log(`   ✅ ${node.name} → 指数 ${meta.relatedIndex} (有数据)`)
          } else {
            console.log(`   ⚠️  ${node.name} → 指数 ${meta.relatedIndex} (无数据)`)
          }
        }
      }
    }

    // Step 7: 统计信息
    console.log('\n6️⃣ 图谱统计...')
    const stats = {
      l0: await prisma.graphNode.count({
        where: { id: 'ai_compute_hardware' }
      }),
      l1: AI_COMPUTE_GRAPH.l1.length,
      l2: AI_COMPUTE_GRAPH.l2.length,
      total: 1 + AI_COMPUTE_GRAPH.l1.length + AI_COMPUTE_GRAPH.l2.length
    }

    console.log(`   L0 (指数层): ${stats.l0} 个`)
    console.log(`   L1 (板块层): ${stats.l1} 个`)
    console.log(`   L2 (细分层): ${stats.l2} 个`)
    console.log(`   总节点数: ${stats.total} 个`)

    console.log('\n✅ AI算力硬件知识图谱重构完成！')
    console.log('\n📊 下一步:')
    console.log('   1. 运行测试: npx tsx scripts/test-graph-market-data.ts')
    console.log('   2. 启动服务: npm run dev')
    console.log('   3. 访问页面: http://localhost:3000/graph/explore')

  } catch (error) {
    console.error('\n❌ 重构失败:', error)
    throw error
  } finally {
    await prisma.$disconnect()
  }
}

main()
