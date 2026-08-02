#!/usr/bin/env tsx
import prisma from '../src/lib/db/prisma'

async function main() {
  console.log('=== 检查知识图谱节点的市场数据覆盖情况 ===\n')

  // 查询所有level 0的根节点
  const rootNodes = await prisma.graphNode.findMany({
    where: { level: 0 },
    select: {
      id: true,
      name: true,
      type: true,
      metadata: true
    },
    orderBy: { id: 'asc' }
  })

  console.log(`找到 ${rootNodes.length} 个L0根节点:\n`)

  for (const node of rootNodes) {
    console.log(`📊 ${node.name} (${node.id})`)
    console.log(`   类型: ${node.type}`)

    if (node.metadata) {
      try {
        const meta = JSON.parse(node.metadata as string)
        console.log(`   ✅ 有metadata`)
        console.log(`   - relatedIndex: ${meta.relatedIndex || '无'}`)
        console.log(`   - trackingETFs: ${meta.trackingETFs?.length || 0} 个`)
        if (meta.trackingETFs && meta.trackingETFs.length > 0) {
          meta.trackingETFs.forEach((etf: any) => {
            console.log(`     - ${etf.ticker}: ${etf.name}`)
          })
        }
      } catch (e: any) {
        console.log(`   ⚠️  metadata解析失败: ${e.message}`)
      }
    } else {
      console.log(`   ❌ 无metadata`)
    }
    console.log('')
  }

  // 统计各领域节点数量
  console.log('\n=== 各领域节点统计 ===\n')
  const allNodes = await prisma.graphNode.findMany({
    select: {
      id: true,
      name: true,
      level: true,
      parentId: true,
      metadata: true
    }
  })

  // 按根节点分组统计
  const domainStats: Record<string, any> = {}

  for (const node of allNodes) {
    if (node.level === 0) {
      domainStats[node.id] = {
        name: node.name,
        l0: 1,
        l1: 0,
        l2: 0,
        total: 1,
        hasMetadata: !!node.metadata
      }
    }
  }

  for (const node of allNodes) {
    if (node.level === 1 && node.parentId) {
      const domain = domainStats[node.parentId]
      if (domain) {
        domain.l1++
        domain.total++
      }
    } else if (node.level === 2 && node.parentId) {
      // 找到L1的父节点
      const l1Parent = allNodes.find(n => n.id === node.parentId)
      if (l1Parent && l1Parent.parentId) {
        const domain = domainStats[l1Parent.parentId]
        if (domain) {
          domain.l2++
          domain.total++
        }
      }
    }
  }

  console.log('领域名称\t\t\tL0\tL1\tL2\t总计\tMetadata')
  console.log('-'.repeat(70))
  for (const [id, stats] of Object.entries(domainStats)) {
    const metaStatus = stats.hasMetadata ? '✅' : '❌'
    console.log(`${stats.name.padEnd(20)}\t${stats.l0}\t${stats.l1}\t${stats.l2}\t${stats.total}\t${metaStatus}`)
  }

  await prisma.$disconnect()
}

main()
