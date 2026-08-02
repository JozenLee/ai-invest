// 为AI算力硬件节点添加行业指数关联和元数据
import { PrismaClient } from '@prisma/client'
import { PrismaBetterSqlite3 } from '@prisma/adapter-better-sqlite3'
import path from 'path'

const dbPath = path.resolve(__dirname, '../prisma/dev.db')
const adapter = new PrismaBetterSqlite3({
  url: `file:${dbPath}`,
})
const prisma = new PrismaClient({ adapter })

async function main() {
  console.log('开始为AI算力硬件节点添加市场数据关联...')

  // 为不同类型的节点添加相关指数和ETF跟踪信息
  const enhancements = [
    // 芯片设计节点
    {
      types: ['chip_design'],
      metadata: {
        relatedIndex: '931865', // 中证半导体
        trackingETFs: [
          { ticker: '512480', name: '半导体ETF' },
          { ticker: '159995', name: '芯片ETF' },
        ],
        industryChain: 'upstream',
        keyDrivers: ['GPU需求', '先进制程', 'AI芯片'],
      }
    },
    // 存储/HBM节点
    {
      types: ['memory'],
      metadata: {
        relatedIndex: '931865', // 中证半导体
        trackingETFs: [
          { ticker: '512480', name: '半导体ETF' },
          { ticker: '159995', name: '芯片ETF' },
        ],
        industryChain: 'upstream',
        keyDrivers: ['HBM需求', 'AI服务器', '存储容量'],
        supplyTightness: 'tight',
      }
    },
    // 服务器节点
    {
      types: ['server'],
      metadata: {
        relatedIndex: '930713', // 中证人工智能
        trackingETFs: [
          { ticker: '515070', name: 'AI ETF' },
        ],
        industryChain: 'midstream',
        keyDrivers: ['数据中心建设', 'AI算力需求', '云计算扩张'],
      }
    },
    // 散热节点
    {
      types: ['cooling'],
      metadata: {
        relatedIndex: '930713', // 中证人工智能
        trackingETFs: [
          { ticker: '515070', name: 'AI ETF' },
        ],
        industryChain: 'supporting',
        keyDrivers: ['液冷技术', '高功耗GPU', '数据中心'],
        emergingTech: 'liquid_cooling',
      }
    },
    // 光模块节点
    {
      types: ['optical_module', 'cpo', 'optical_comm'],
      metadata: {
        relatedIndex: '931160', // 中证通信设备
        trackingETFs: [
          { ticker: '515880', name: '通信ETF' },
        ],
        industryChain: 'supporting',
        keyDrivers: ['800G需求', 'CPO技术', 'AI互联'],
        emergingTech: 'cpo',
      }
    },
    // 数据中心节点
    {
      types: ['data_center'],
      metadata: {
        relatedIndex: '930713', // 中证人工智能
        trackingETFs: [
          { ticker: '515070', name: 'AI ETF' },
        ],
        industryChain: 'downstream',
        keyDrivers: ['云厂商资本开支', 'AI训练需求', '算力租赁'],
      }
    },
    // 网络设备节点
    {
      types: ['networking'],
      metadata: {
        relatedIndex: '931160', // 中证通信设备
        trackingETFs: [
          { ticker: '515880', name: '通信ETF' },
        ],
        industryChain: 'supporting',
        keyDrivers: ['数据中心网络', 'InfiniBand', '以太网'],
      }
    },
    // PCB节点
    {
      types: ['pcb'],
      metadata: {
        relatedIndex: '931865', // 中证半导体
        trackingETFs: [
          { ticker: '512480', name: '半导体ETF' },
        ],
        industryChain: 'supporting',
        keyDrivers: ['高频高速板', 'AI服务器', '算力需求'],
      }
    },
  ]

  let updateCount = 0

  for (const enhancement of enhancements) {
    for (const type of enhancement.types) {
      const nodes = await prisma.graphNode.findMany({
        where: { type }
      })

      console.log(`处理 ${type} 类型节点: ${nodes.length} 个`)

      for (const node of nodes) {
        // 合并现有metadata和新metadata
        let existingMetadata = {}
        if (node.metadata) {
          try {
            existingMetadata = JSON.parse(node.metadata)
          } catch (e) {
            console.warn(`节点 ${node.name} 的metadata解析失败`)
          }
        }

        const updatedMetadata = {
          ...existingMetadata,
          ...enhancement.metadata,
        }

        await prisma.graphNode.update({
          where: { id: node.id },
          data: {
            metadata: JSON.stringify(updatedMetadata)
          }
        })

        updateCount++
      }
    }
  }

  console.log(`完成！共更新 ${updateCount} 个节点的元数据`)

  // 输出统计信息
  console.log('\n=== 增强后的节点统计 ===')
  const stats = await prisma.graphNode.groupBy({
    by: ['type'],
    _count: true,
    where: {
      type: {
        in: enhancements.flatMap(e => e.types)
      }
    }
  })

  for (const stat of stats) {
    console.log(`${stat.type}: ${stat._count} 个节点`)
  }
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
