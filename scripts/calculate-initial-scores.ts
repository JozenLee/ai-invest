// scripts/calculate-initial-scores.ts

import prisma from '../src/lib/db/prisma'
import { scoreUpdater } from '../src/lib/services/score-updater.service'

async function main() {
  console.log('开始计算初始评分...')

  // Get all nodes with subGraphId
  const nodes = await prisma.graphNode.findMany({
    where: {
      subGraphId: { not: null },
    },
    select: { id: true, name: true, subGraphId: true },
  })

  console.log(`找到 ${nodes.length} 个节点需要计算评分`)

  let successCount = 0
  let failCount = 0

  for (let i = 0; i < nodes.length; i++) {
    const node = nodes[i]
    try {
      console.log(`[${i + 1}/${nodes.length}] 计算节点: ${node.name} (${node.id})`)
      await scoreUpdater.updateNodeScore(node.id, 'manual')
      successCount++
    } catch (error) {
      console.error(`  失败: ${error}`)
      failCount++
    }
  }

  console.log('\n✅ 初始评分计算完成')
  console.log(`成功: ${successCount}, 失败: ${failCount}`)
}

main()
  .catch((e) => {
    console.error('脚本执行失败:', e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
