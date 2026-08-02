// 为AI算力硬件节点添加市场数据元数据（更新版）
import { PrismaClient } from '@prisma/client'
import { PrismaBetterSqlite3 } from '@prisma/adapter-better-sqlite3'
import path from 'path'

const dbPath = path.resolve(__dirname, '../prisma/dev.db')
const adapter = new PrismaBetterSqlite3({
  url: `file:${dbPath}`,
})
const prisma = new PrismaClient({ adapter })

async function main() {
  console.log('开始为AI算力硬件节点添加市场数据关联...\n')

  // 1. 为AI算力指数节点添加元数据
  console.log('1. 处理AI算力指数节点...')
  const aiIndex = await prisma.graphNode.findFirst({
    where: { type: 'ai_index' }
  })

  if (aiIndex) {
    const metadata = {
      relatedIndex: '930713', // 中证人工智能
      trackingETFs: [
        { ticker: '515070', name: 'AI ETF' },
        { ticker: '512480', name: '半导体ETF' },
      ],
      category: 'tech',
      industryChain: 'full',
    }

    await prisma.graphNode.update({
      where: { id: aiIndex.id },
      data: { metadata: JSON.stringify(metadata) }
    })
    console.log(`   ✅ ${aiIndex.name}`)
  }

  // 2. 为一级分类节点添加元数据
  console.log('\n2. 处理一级分类节点...')

  const l1Enhancements = [
    {
      name: '芯片设计',
      metadata: {
        relatedIndex: '931865', // 中证半导体
        trackingETFs: [
          { ticker: '512480', name: '半导体ETF' },
          { ticker: '159995', name: '芯片ETF' },
        ],
        industryChain: 'upstream',
        keyDrivers: ['AI芯片需求', '先进制程', 'GPU供应'],
      }
    },
    {
      name: '算力基础设施',
      metadata: {
        relatedIndex: '930713', // 中证人工智能
        trackingETFs: [
          { ticker: '515070', name: 'AI ETF' },
        ],
        industryChain: 'midstream',
        keyDrivers: ['数据中心建设', 'AI训练需求', '算力租赁'],
      }
    },
    {
      name: '网络互联',
      metadata: {
        relatedIndex: '931160', // 中证通信设备
        trackingETFs: [
          { ticker: '515880', name: '通信ETF' },
        ],
        industryChain: 'supporting',
        keyDrivers: ['数据中心网络', 'AI互联', '高带宽需求'],
      }
    }
  ]

  for (const enhancement of l1Enhancements) {
    const node = await prisma.graphNode.findFirst({
      where: { type: 'ai_l1', name: enhancement.name }
    })

    if (node) {
      await prisma.graphNode.update({
        where: { id: node.id },
        data: { metadata: JSON.stringify(enhancement.metadata) }
      })
      console.log(`   ✅ ${node.name}`)
    }
  }

  // 3. 为二级细分节点添加元数据
  console.log('\n3. 处理二级细分节点...')

  const l2Enhancements = [
    {
      name: 'GPU/AI芯片',
      metadata: {
        relatedIndex: '931865',
        trackingETFs: [{ ticker: '512480', name: '半导体ETF' }],
        keyDrivers: ['AI训练需求', '推理加速', 'GPU供应紧张'],
        keyPlayers: ['NVIDIA', '华为', '寒武纪'],
        emergingTech: 'ai_chip',
      }
    },
    {
      name: 'HBM高带宽内存',
      metadata: {
        relatedIndex: '931865',
        trackingETFs: [{ ticker: '512480', name: '半导体ETF' }],
        keyDrivers: ['GPU需求', '带宽要求', 'HBM3'],
        supplyTightness: 'tight',
        keyPlayers: ['SK海力士', '美光', '三星'],
      }
    },
    {
      name: 'AI服务器',
      metadata: {
        relatedIndex: '930713',
        trackingETFs: [{ ticker: '515070', name: 'AI ETF' }],
        keyDrivers: ['数据中心建设', 'AI训练', '算力租赁'],
        keyPlayers: ['浪潮', '联想', '华为'],
      }
    },
    {
      name: '液冷散热',
      metadata: {
        relatedIndex: '930713',
        trackingETFs: [{ ticker: '515070', name: 'AI ETF' }],
        keyDrivers: ['GPU功耗提升', '数据中心节能', '液冷技术'],
        emergingTech: 'liquid_cooling',
      }
    },
    {
      name: '高性能存储',
      metadata: {
        relatedIndex: '930713',
        trackingETFs: [{ ticker: '515070', name: 'AI ETF' }],
        keyDrivers: ['大模型训练', '数据吞吐', '存储容量'],
      }
    },
    {
      name: '800G光模块',
      metadata: {
        relatedIndex: '931160',
        trackingETFs: [{ ticker: '515880', name: '通信ETF' }],
        keyDrivers: ['数据中心网络', 'AI互联', '800G升级'],
      }
    },
    {
      name: 'CPO共封装光学',
      metadata: {
        relatedIndex: '931160',
        trackingETFs: [{ ticker: '515880', name: '通信ETF' }],
        keyDrivers: ['带宽需求', '功耗优化', 'CPO技术'],
        emergingTech: 'cpo',
      }
    },
  ]

  for (const enhancement of l2Enhancements) {
    const node = await prisma.graphNode.findFirst({
      where: { type: 'ai_l2', name: enhancement.name }
    })

    if (node) {
      // 合并现有metadata
      let existingMetadata = {}
      if (node.metadata) {
        try {
          existingMetadata = JSON.parse(node.metadata)
        } catch (e) {
          // ignore
        }
      }

      const updatedMetadata = {
        ...existingMetadata,
        ...enhancement.metadata,
      }

      await prisma.graphNode.update({
        where: { id: node.id },
        data: { metadata: JSON.stringify(updatedMetadata) }
      })
      console.log(`   ✅ ${node.name}`)
    }
  }

  console.log('\n=== 完成 ===')
  console.log(`\n共更新: ${1 + l1Enhancements.length + l2Enhancements.length} 个节点的元数据`)

  // 验证
  console.log('\n=== 验证元数据 ===\n')
  const allAiNodes = await prisma.graphNode.findMany({
    where: { type: { in: ['ai_index', 'ai_l1', 'ai_l2'] } },
    select: { name: true, type: true, metadata: true }
  })

  allAiNodes.forEach(node => {
    let meta: any = {}
    if (node.metadata) {
      try {
        meta = JSON.parse(node.metadata)
      } catch (e) {
        // ignore
      }
    }

    console.log(`${node.name}:`)
    if (meta.relatedIndex) {
      console.log(`  - 关联指数: ${meta.relatedIndex}`)
    }
    if (meta.trackingETFs && meta.trackingETFs.length > 0) {
      console.log(`  - 跟踪ETF: ${meta.trackingETFs.map((e: any) => e.ticker).join(', ')}`)
    }
    if (meta.keyDrivers && meta.keyDrivers.length > 0) {
      console.log(`  - 关键驱动: ${meta.keyDrivers.slice(0, 2).join(', ')}`)
    }
    console.log()
  })
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
