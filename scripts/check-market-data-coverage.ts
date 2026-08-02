#!/usr/bin/env tsx
/**
 * 检查知识图谱节点的市场数据覆盖情况
 */

import prisma from '../src/lib/db/prisma'

async function checkMarketDataCoverage() {
  console.log('🔍 检查知识图谱节点市场数据覆盖情况...\n')

  // 1. 统计节点总数和类型分布
  const totalNodes = await prisma.graphNode.count()
  const nodesByType = await prisma.graphNode.groupBy({
    by: ['type'],
    _count: true,
  })

  console.log(`📊 节点总数: ${totalNodes}`)
  console.log(`📋 类型分布:`)
  nodesByType.forEach(({ type, _count }) => {
    console.log(`   - ${type}: ${_count}`)
  })
  console.log()

  // 2. 检查 metadata 字段覆盖情况
  const nodesWithMetadata = await prisma.graphNode.count({
    where: {
      metadata: { not: null },
    },
  })

  console.log(`🏷️  Metadata 覆盖:`)
  console.log(`   - 有 metadata: ${nodesWithMetadata}/${totalNodes} (${(nodesWithMetadata / totalNodes * 100).toFixed(1)}%)`)
  console.log()

  // 3. 检查各类型节点是否有 metadata 详情
  const nodesWithDetails = await prisma.graphNode.findMany({
    where: {
      metadata: { not: null },
    },
    select: {
      id: true,
      name: true,
      type: true,
      metadata: true,
    },
    take: 10,
  })

  console.log(`📝 前10个有 metadata 的节点:`)
  nodesWithDetails.forEach((node) => {
    const metadata = typeof node.metadata === 'string'
      ? JSON.parse(node.metadata)
      : node.metadata

    console.log(`   - ${node.name} (${node.type})`)
    console.log(`     relatedIndex: ${metadata?.relatedIndex || '无'}`)
    console.log(`     trackingETFs: ${metadata?.trackingETFs?.length || 0} 个`)
  })
  console.log()

  // 4. 检查板块映射覆盖情况（使用更新后的映射逻辑）
  const sectorMapping = {
    // 原有映射
    'chip_design': '芯片',
    'memory': '存储芯片',
    'server': '服务器',
    'cooling': '散热',
    'data_center': '数据中心',
    'optical_module': '光模块',
    'cpo': '光通信',
    'networking': '通信设备',

    // 新增映射
    'ai_index': '人工智能',
    'ai_l1': '人工智能',
    'ai_l2': '人工智能',
    'biotech_index': '医药生物',
    'biotech_l1': '医药生物',
    'biotech_l2': '医药生物',
    'ce_index': '电子',
    'ce_l1': '电子',
    'ce_l2': '电子',
    'consumer_index': '消费',
    'consumer_l1': '消费',
    'consumer_l2': '消费',
    'defense_index': '国防军工',
    'defense_l1': '国防军工',
    'defense_l2': '国防军工',
    'digital_index': '通信',
    'digital_l1': '通信',
    'digital_l2': '通信',
    'energy_index': '电力设备',
    'energy_l1': '电力设备',
    'energy_l2': '电力设备',
    'nev_index': '汽车',
    'nev_l1': '汽车',
    'nev_l2': '汽车',
    'nev_l3': '汽车',
    'materials_index': '基础化工',
    'materials_l1': '基础化工',
    'materials_l2': '基础化工',
    'robotics_index': '机械设备',
    'robotics_l1': '机械设备',
    'robotics_l2': '机械设备',
    'sector_l1': '芯片',
    'industry_l2': '电子',
    'sub_sector': '电子',
    'subsector_l2': '电子',
  }

  const mappedTypes = Object.keys(sectorMapping)
  const nodesMappedToSector = await prisma.graphNode.count({
    where: {
      type: { in: mappedTypes },
    },
  })

  // 统计各板块的节点数
  const sectorCounts: Record<string, number> = {}
  nodesByType.forEach(({ type, _count }) => {
    const sector = sectorMapping[type as keyof typeof sectorMapping]
    if (sector) {
      sectorCounts[sector] = (sectorCounts[sector] || 0) + _count
    }
  })

  console.log(`🗺️  板块映射覆盖 (已更新):`)
  console.log(`   - 可映射节点: ${nodesMappedToSector}/${totalNodes} (${(nodesMappedToSector / totalNodes * 100).toFixed(1)}%)`)
  console.log(`   - 支持的节点类型: ${mappedTypes.length} 种`)
  console.log(`   - 映射到的板块:`)
  Object.entries(sectorCounts)
    .sort(([, a], [, b]) => b - a)
    .forEach(([sector, count]) => {
      console.log(`     • ${sector}: ${count} 个节点`)
    })
  console.log()

  // 5. 检查新闻关联情况
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
  const nodesWithNews = await prisma.newsGraphLink.groupBy({
    by: ['nodeId'],
    where: {
      createdAt: {
        gte: sevenDaysAgo,
      },
    },
    _count: true,
    orderBy: {
      _count: {
        nodeId: 'desc',
      },
    },
    take: 10,
  })

  const nodesWithNewsDetails = await Promise.all(
    nodesWithNews.map(async (item) => {
      const node = await prisma.graphNode.findUnique({
        where: { id: item.nodeId },
        select: { name: true },
      })
      return {
        nodeId: item.nodeId,
        name: node?.name || 'Unknown',
        newsCount: item._count,
      }
    })
  )

  console.log(`📰 新闻关联情况 (7日内):`)
  if (nodesWithNewsDetails.length === 0) {
    console.log(`   ⚠️  没有节点关联新闻`)
  } else {
    nodesWithNewsDetails.forEach((item) => {
      console.log(`   - ${item.name}: ${item.newsCount} 条新闻`)
    })
  }
  console.log()

  // 6. 检查数据表数据量
  const indexDailyCount = await prisma.indexDaily.count()
  const etfDailyCount = await prisma.eTFDaily.count()
  const sectorCapitalFlowCount = await prisma.sectorCapitalFlow.count()
  const newsGraphLinkCount = await prisma.newsGraphLink.count()

  console.log(`💾 相关数据表数据量:`)
  console.log(`   - indexDaily: ${indexDailyCount} 条`)
  console.log(`   - eTFDaily: ${etfDailyCount} 条`)
  console.log(`   - sectorCapitalFlow: ${sectorCapitalFlowCount} 条`)
  console.log(`   - newsGraphLink: ${newsGraphLinkCount} 条`)
  console.log()

  // 7. 生成问题总结
  console.log(`⚠️  问题总结:`)
  const issues: string[] = []

  if (nodesWithMetadata / totalNodes < 0.5) {
    issues.push(`只有 ${(nodesWithMetadata / totalNodes * 100).toFixed(1)}% 的节点有 metadata`)
  }
  if (nodesMappedToSector / totalNodes < 0.5) {
    issues.push(`只有 ${(nodesMappedToSector / totalNodes * 100).toFixed(1)}% 的节点可以映射到板块`)
  }
  if (newsGraphLinkCount === 0) {
    issues.push(`没有建立节点与新闻的关联关系`)
  }
  if (sectorCapitalFlowCount === 0) {
    issues.push(`sectorCapitalFlow 表为空，无法获取资金流向数据`)
  }

  if (issues.length === 0) {
    console.log(`   ✅ 暂无明显问题`)
  } else {
    issues.forEach((issue, i) => {
      console.log(`   ${i + 1}. ${issue}`)
    })
  }
  console.log()

  console.log(`💡 建议:`)
  console.log(`   1. 为节点补充 metadata.relatedIndex 和 metadata.trackingETFs`)
  console.log(`   2. 扩展 mapNodeToSector 映射表，覆盖更多节点类型`)
  console.log(`   3. 运行新闻关联脚本，建立 NewsGraphLink 数据`)
  console.log(`   4. 确保 indexDaily、eTFDaily、sectorCapitalFlow 表有数据`)
}

checkMarketDataCoverage()
  .catch(console.error)
  .finally(() => prisma.$disconnect())
