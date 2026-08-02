#!/usr/bin/env tsx
/**
 * 重构剩余三个领域的知识图谱
 * 7. 消费电子
 * 8. 数字经济
 * 9. 先进材料
 */

import prisma from '../src/lib/db/prisma'
import { CONSUMER_ELECTRONICS_GRAPH } from './domains/consumer-electronics'
import { DIGITAL_ECONOMY_GRAPH } from './domains/digital-economy'
import { ADVANCED_MATERIALS_GRAPH } from './domains/advanced-materials'

async function main() {
  console.log('=== 开始重构剩余三个领域的知识图谱 ===\n')

  const domains = [
    { name: '消费电子', graph: CONSUMER_ELECTRONICS_GRAPH },
    { name: '数字经济', graph: DIGITAL_ECONOMY_GRAPH },
    { name: '先进材料', graph: ADVANCED_MATERIALS_GRAPH },
  ]

  for (const domain of domains) {
    console.log(`\n📊 处理领域: ${domain.name}`)
    await rebuildDomain(domain.graph)
  }

  console.log('\n✅ 剩余三个领域重构完成！')
  await prisma.$disconnect()
}

async function rebuildDomain(graph: any) {
  const rootId = graph.root.id

  // 检查是否已存在
  const existing = await prisma.graphNode.findUnique({
    where: { id: rootId }
  })

  if (existing) {
    console.log(`   ⚠️  ${graph.root.name} 已存在，跳过`)
    return
  }

  // 创建L0根节点
  await prisma.graphNode.create({
    data: {
      ...graph.root,
      metadata: JSON.stringify(graph.root.metadata)
    }
  })
  console.log(`   ✅ 创建根节点: ${graph.root.name}`)

  // 创建L1节点
  for (const node of graph.l1) {
    await prisma.graphNode.create({
      data: {
        ...node,
        metadata: JSON.stringify(node.metadata)
      }
    })
    console.log(`   ✅ 创建L1: ${node.name}`)
  }

  // 创建L2节点
  for (const node of graph.l2) {
    await prisma.graphNode.create({
      data: {
        ...node,
        metadata: JSON.stringify(node.metadata)
      }
    })
  }
  console.log(`   ✅ 创建 ${graph.l2.length} 个L2节点`)
}

main()
