// 创建完整的AI算力硬件知识图谱子图
import { PrismaClient } from '@prisma/client'
import { PrismaBetterSqlite3 } from '@prisma/adapter-better-sqlite3'
import path from 'path'

const dbPath = path.resolve(__dirname, '../prisma/dev.db')
const adapter = new PrismaBetterSqlite3({
  url: `file:${dbPath}`,
})
const prisma = new PrismaClient({ adapter })

async function main() {
  console.log('开始创建AI算力硬件完整子图...\n')

  // 1. 删除现有的不完整的AI算力节点
  console.log('1. 清理现有的不完整节点...')
  const oldAiTypes = ['chip_design', 'memory', 'server', 'cooling', 'optical_module', 'cpo']

  // 先获取这些节点的ID
  const oldNodes = await prisma.graphNode.findMany({
    where: { type: { in: oldAiTypes } },
    select: { id: true }
  })
  const oldNodeIds = oldNodes.map(n => n.id)

  if (oldNodeIds.length > 0) {
    // 删除关联的边
    await prisma.graphEdge.deleteMany({
      where: {
        OR: [
          { sourceId: { in: oldNodeIds } },
          { targetId: { in: oldNodeIds } }
        ]
      }
    })
    console.log('   已删除关联的边')

    // 删除关联的股票
    await prisma.graphStock.deleteMany({
      where: { nodeId: { in: oldNodeIds } }
    })
    console.log('   已删除关联的股票')

    // 删除关联的新闻链接
    await prisma.newsGraphLink.deleteMany({
      where: { nodeId: { in: oldNodeIds } }
    })
    console.log('   已删除关联的新闻链接')

    // 删除关联的变更日志
    await prisma.graphChangeLog.deleteMany({
      where: { nodeId: { in: oldNodeIds } }
    })
    console.log('   已删除关联的变更日志')

    // 最后删除节点
    await prisma.graphNode.deleteMany({
      where: { type: { in: oldAiTypes } }
    })
    console.log('   已删除旧的AI算力节点')
  }
  console.log()

  // 2. 创建 Level 0: 指数节点
  console.log('2. 创建Level 0指数节点...')
  const aiIndex = await prisma.graphNode.create({
    data: {
      type: 'ai_index',
      name: 'AI算力',
      description: 'AI算力硬件产业链，包括芯片、服务器、散热、网络等',
      level: 0,
      metadata: JSON.stringify({
        relatedIndex: '930713', // 中证人工智能
        trackingETFs: [
          { ticker: '515070', name: 'AI ETF' },
          { ticker: '512480', name: '半导体ETF' },
        ],
        category: 'tech',
      })
    }
  })
  console.log(`   创建: ${aiIndex.name} (ai_index)\n`)

  // 3. 创建 Level 1: 一级分类
  console.log('3. 创建Level 1一级分类...')

  const chipL1 = await prisma.graphNode.create({
    data: {
      type: 'ai_l1',
      name: '芯片设计',
      description: 'AI芯片、GPU、专用芯片设计',
      parentId: aiIndex.id,
      level: 1,
      metadata: JSON.stringify({
        relatedIndex: '931865', // 中证半导体
        industryChain: 'upstream',
      })
    }
  })
  console.log(`   创建: ${chipL1.name}`)

  const infraL1 = await prisma.graphNode.create({
    data: {
      type: 'ai_l1',
      name: '算力基础设施',
      description: 'AI服务器、存储、散热、电源等基础设施',
      parentId: aiIndex.id,
      level: 1,
      metadata: JSON.stringify({
        relatedIndex: '930713',
        industryChain: 'midstream',
      })
    }
  })
  console.log(`   创建: ${infraL1.name}`)

  const networkL1 = await prisma.graphNode.create({
    data: {
      type: 'ai_l1',
      name: '网络互联',
      description: '光模块、CPO、高速网络设备',
      parentId: aiIndex.id,
      level: 1,
      metadata: JSON.stringify({
        relatedIndex: '931160', // 中证通信设备
        industryChain: 'supporting',
      })
    }
  })
  console.log(`   创建: ${networkL1.name}\n`)

  // 4. 创建 Level 2: 二级细分
  console.log('4. 创建Level 2二级细分...')

  // 芯片设计下的细分
  const chipNodes = [
    {
      name: 'GPU/AI芯片',
      description: 'NVIDIA GPU、国产AI芯片（华为昇腾、寒武纪等）',
      parentId: chipL1.id,
      metadata: {
        keyDrivers: ['AI训练需求', '推理加速', '算力竞争'],
        keyPlayers: ['NVIDIA', '华为', '寒武纪'],
      }
    },
    {
      name: 'HBM高带宽内存',
      description: 'AI芯片配套的高带宽内存',
      parentId: chipL1.id,
      metadata: {
        keyDrivers: ['GPU需求', '带宽要求', 'HBM3'],
        supplyTightness: 'tight',
        keyPlayers: ['SK海力士', '美光', '三星'],
      }
    },
  ]

  for (const node of chipNodes) {
    const created = await prisma.graphNode.create({
      data: {
        type: 'ai_l2',
        name: node.name,
        description: node.description,
        parentId: node.parentId,
        level: 2,
        metadata: JSON.stringify(node.metadata),
      }
    })
    console.log(`   创建: ${created.name}`)
  }

  // 算力基础设施下的细分
  const infraNodes = [
    {
      name: 'AI服务器',
      description: '搭载AI芯片的高性能服务器',
      parentId: infraL1.id,
      metadata: {
        keyDrivers: ['数据中心建设', 'AI训练', '算力租赁'],
        keyPlayers: ['浪潮', '联想', '华为'],
      }
    },
    {
      name: '液冷散热',
      description: '高功耗GPU配套的液冷散热方案',
      parentId: infraL1.id,
      metadata: {
        keyDrivers: ['GPU功耗提升', '数据中心节能', '液冷技术'],
        emergingTech: 'liquid_cooling',
      }
    },
    {
      name: '高性能存储',
      description: 'AI训练和推理所需的高性能存储系统',
      parentId: infraL1.id,
      metadata: {
        keyDrivers: ['大模型训练', '数据吞吐', '存储容量'],
      }
    },
  ]

  for (const node of infraNodes) {
    const created = await prisma.graphNode.create({
      data: {
        type: 'ai_l2',
        name: node.name,
        description: node.description,
        parentId: node.parentId,
        level: 2,
        metadata: JSON.stringify(node.metadata),
      }
    })
    console.log(`   创建: ${created.name}`)
  }

  // 网络互联下的细分
  const networkNodes = [
    {
      name: '800G光模块',
      description: '数据中心高速光模块',
      parentId: networkL1.id,
      metadata: {
        keyDrivers: ['数据中心网络', 'AI互联', '800G升级'],
      }
    },
    {
      name: 'CPO共封装光学',
      description: '光电共封装技术，提升带宽降低功耗',
      parentId: networkL1.id,
      metadata: {
        keyDrivers: ['带宽需求', '功耗优化', 'CPO技术'],
        emergingTech: 'cpo',
      }
    },
  ]

  for (const node of networkNodes) {
    const created = await prisma.graphNode.create({
      data: {
        type: 'ai_l2',
        name: node.name,
        description: node.description,
        parentId: node.parentId,
        level: 2,
        metadata: JSON.stringify(node.metadata),
      }
    })
    console.log(`   创建: ${created.name}`)
  }

  console.log('\n5. 创建节点间的关系（边）...')

  // 创建供应链关系
  const allL2Nodes = await prisma.graphNode.findMany({
    where: { type: 'ai_l2' }
  })

  const edgeData = [
    // GPU/AI芯片 -> AI服务器
    { from: 'GPU/AI芯片', to: 'AI服务器', relation: 'supply_chain', description: 'GPU供应给服务器厂商' },
    // HBM -> GPU/AI芯片
    { from: 'HBM高带宽内存', to: 'GPU/AI芯片', relation: 'supply_chain', description: 'HBM配套AI芯片' },
    // AI服务器 -> 液冷散热
    { from: 'AI服务器', to: '液冷散热', relation: 'demand_driver', description: '高功耗服务器需要液冷' },
    // AI服务器 -> 800G光模块
    { from: 'AI服务器', to: '800G光模块', relation: 'demand_driver', description: '服务器互联需要高速光模块' },
    // 800G光模块 -> CPO
    { from: '800G光模块', to: 'CPO共封装光学', relation: 'tech_evolution', description: 'CPO是下一代技术' },
  ]

  for (const edge of edgeData) {
    const fromNode = allL2Nodes.find(n => n.name === edge.from)
    const toNode = allL2Nodes.find(n => n.name === edge.to)

    if (fromNode && toNode) {
      await prisma.graphEdge.create({
        data: {
          sourceId: fromNode.id,
          targetId: toNode.id,
          relation: edge.relation,
          weight: 0.8,
          direction: 'positive',
          confidence: 0.85,
          description: edge.description,
        }
      })
      console.log(`   创建关系: ${edge.from} → ${edge.to}`)
    }
  }

  // 6. 统计信息
  console.log('\n=== 创建完成 ===')
  const stats = await prisma.graphNode.groupBy({
    by: ['type'],
    _count: true,
    where: {
      type: { in: ['ai_index', 'ai_l1', 'ai_l2'] }
    }
  })

  console.log('\n节点统计:')
  stats.forEach(s => {
    console.log(`  ${s.type}: ${s._count} 个`)
  })

  const edgeCount = await prisma.graphEdge.count({
    where: {
      source: { type: { in: ['ai_index', 'ai_l1', 'ai_l2'] } }
    }
  })
  console.log(`  关系边: ${edgeCount} 条`)

  console.log('\n✅ AI算力硬件完整子图创建成功！')
}

main()
  .then(async () => {
    await prisma.$disconnect()
  })
  .catch(async (e) => {
    console.error('错误:', e)
    await prisma.$disconnect()
    process.exit(1)
  })
