// 处理通用指数节点问题
// 沪深300和科创50不属于特定领域，应该删除或作为参考指数
import { PrismaClient } from '@prisma/client'
import { PrismaBetterSqlite3 } from '@prisma/adapter-better-sqlite3'
import path from 'path'

const dbPath = path.resolve(__dirname, '../prisma/dev.db')
const adapter = new PrismaBetterSqlite3({
  url: `file:${dbPath}`,
})
const prisma = new PrismaClient({ adapter })

async function main() {
  console.log('=== 处理通用指数节点 ===\n')

  // 查看这些通用指数节点
  const genericIndices = await prisma.graphNode.findMany({
    where: { type: 'index' }
  })

  console.log(`找到 ${genericIndices.length} 个通用指数节点:`)
  genericIndices.forEach(n => {
    console.log(`  - ${n.name} (id: ${n.id})`)
  })

  // 选项1: 直接删除（推荐）
  console.log('\n方案1: 删除这些通用指数节点')
  console.log('理由: 沪深300和科创50是大盘指数，不是特定领域的指数')
  console.log('      每个领域应该有自己的专业指数（如AI算力对应中证人工智能）')

  // 选项2: 保留作为参考（不推荐）
  console.log('\n方案2: 保留作为参考指数（不推荐）')
  console.log('理由: 会导致图谱结构混乱，与其他领域不一致')

  console.log('\n执行方案1: 删除通用指数节点...\n')

  for (const node of genericIndices) {
    // 检查是否有子节点
    const children = await prisma.graphNode.count({
      where: { parentId: node.id }
    })

    if (children > 0) {
      console.log(`⚠️  ${node.name} 有 ${children} 个子节点，无法直接删除`)
      continue
    }

    // 检查是否有关联的边
    const edgeCount = await prisma.graphEdge.count({
      where: {
        OR: [
          { sourceId: node.id },
          { targetId: node.id }
        ]
      }
    })

    if (edgeCount > 0) {
      console.log(`  删除 ${node.name} 的 ${edgeCount} 条关联边...`)
      await prisma.graphEdge.deleteMany({
        where: {
          OR: [
            { sourceId: node.id },
            { targetId: node.id }
          ]
        }
      })
    }

    // 删除关联的股票
    const stockCount = await prisma.graphStock.count({
      where: { nodeId: node.id }
    })
    if (stockCount > 0) {
      console.log(`  删除 ${node.name} 的 ${stockCount} 个关联股票...`)
      await prisma.graphStock.deleteMany({
        where: { nodeId: node.id }
      })
    }

    // 删除关联的新闻链接
    const newsCount = await prisma.newsGraphLink.count({
      where: { nodeId: node.id }
    })
    if (newsCount > 0) {
      console.log(`  删除 ${node.name} 的 ${newsCount} 条新闻链接...`)
      await prisma.newsGraphLink.deleteMany({
        where: { nodeId: node.id }
      })
    }

    // 删除变更日志
    await prisma.graphChangeLog.deleteMany({
      where: { nodeId: node.id }
    })

    // 删除节点
    await prisma.graphNode.delete({
      where: { id: node.id }
    })

    console.log(`✅ 已删除: ${node.name}\n`)
  }

  console.log('=== 验证结果 ===\n')

  const remainingGeneric = await prisma.graphNode.count({
    where: { type: 'index' }
  })

  console.log(`剩余通用指数节点: ${remainingGeneric} 个`)

  const allIndices = await prisma.graphNode.findMany({
    where: {
      type: { endsWith: '_index' }
    },
    select: { name: true, type: true }
  })

  console.log(`\n领域专业指数节点: ${allIndices.length} 个`)
  allIndices.forEach(n => {
    console.log(`  ✅ ${n.name} (${n.type})`)
  })

  console.log('\n✅ 处理完成！图谱结构现在统一了。')
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
