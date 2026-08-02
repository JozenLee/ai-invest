import { PrismaClient } from '@prisma/client'
import { PrismaBetterSqlite3 } from '@prisma/adapter-better-sqlite3'
import path from 'path'

const dbPath = path.resolve(__dirname, '../prisma/dev.db')
const adapter = new PrismaBetterSqlite3({
  url: `file:${dbPath}`,
})
const prisma = new PrismaClient({ adapter })

async function main() {
  try {
    console.log('开始删除AI算力硬件节点...')

    // 删除与该节点相关的边
    const deletedEdges = await prisma.graphEdge.deleteMany({
      where: {
        OR: [
          { sourceId: 'ai_compute_hardware' },
          { targetId: 'ai_compute_hardware' }
        ]
      }
    })
    console.log(`已删除 ${deletedEdges.count} 条相关边`)

    // 删除节点
    const deletedNode = await prisma.graphNode.delete({
      where: {
        id: 'ai_compute_hardware'
      }
    })
    console.log(`已删除节点: ${deletedNode.name} (${deletedNode.id})`)

    console.log('删除完成！')
  } catch (error) {
    console.error('删除失败:', error)
    throw error
  } finally {
    await prisma.$disconnect()
  }
}

main()
  .catch((error) => {
    console.error(error)
    process.exit(1)
  })
