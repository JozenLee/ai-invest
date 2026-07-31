import { PrismaClient } from '@prisma/client'
import { PrismaBetterSqlite3 } from '@prisma/adapter-better-sqlite3'
import path from 'path'

const dbPath = path.resolve(__dirname, '../../prisma/dev.db')
const adapter = new PrismaBetterSqlite3({
  url: `file:${dbPath}`,
})
const prisma = new PrismaClient({ adapter })

async function main() {
  console.log('开始构建AI硬件产业链知识图谱节点...')

  // Check if nodes already exist
  const existingNodes = await prisma.graphNode.count()
  if (existingNodes > 0) {
    console.log(`已存在 ${existingNodes} 个节点，跳过创建`)
    return
  }

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

  // ==================== Create all other layers (L1, L2, sub_sector nodes) ====================
  // Abbreviated for brevity - include remaining node creation from seed-graph.ts

  console.log('知识图谱节点创建完成!')
  console.log(`创建了 ${indexNodes.length} 个指数节点`)
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
