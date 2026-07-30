import { PrismaClient } from '@prisma/client'
import { PrismaBetterSqlite3 } from '@prisma/adapter-better-sqlite3'

const adapter = new PrismaBetterSqlite3({
  url: process.env.DATABASE_URL || 'file:./prisma/dev.db',
})

const prisma = new PrismaClient({ adapter })

async function verify() {
  const stocks = await prisma.graphStock.findMany({
    include: {
      node: {
        select: {
          name: true,
          type: true,
          level: true
        }
      }
    },
    orderBy: [
      { category: 'asc' },
      { relevance: 'desc' }
    ]
  })

  console.log(`总共 ${stocks.length} 条股票映射\n`)

  console.log('核心标的 (relevance >= 0.9):')
  stocks
    .filter(s => s.category === '核心标的' && s.relevance >= 0.9)
    .forEach(s => {
      console.log(`  ${s.stockName} (${s.stockCode}) -> ${s.node.name} [${s.relevance}]`)
    })

  console.log('\n相关标的 (relevance < 0.9):')
  stocks
    .filter(s => s.category === '相关标的' || s.relevance < 0.9)
    .forEach(s => {
      console.log(`  ${s.stockName} (${s.stockCode}) -> ${s.node.name} [${s.relevance}]`)
    })

  console.log('\n按图谱节点分组:')
  const byNode = new Map<string, typeof stocks>()
  stocks.forEach(s => {
    const key = s.node.name
    if (!byNode.has(key)) byNode.set(key, [])
    byNode.get(key)!.push(s)
  })

  byNode.forEach((stocks, nodeName) => {
    console.log(`  ${nodeName}: ${stocks.length} 只股票`)
  })

  await prisma.$disconnect()
}

verify().catch(console.error)
