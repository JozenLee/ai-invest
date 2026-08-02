#!/usr/bin/env tsx
/**
 * 更新现有领域节点的市场数据信息
 * 为已存在但缺少metadata的节点补充完整的市场数据映射
 */

import prisma from '../src/lib/db/prisma'

// 领域ID映射到新图谱定义
const DOMAIN_MAPPINGS = {
  // 新能源汽车
  'nev_root': {
    newId: 'new_energy_vehicle',
    metadata: {
      relatedIndex: '399976',
      indexName: '中证新能源汽车指数',
      trackingETFs: [
        { ticker: '515030', name: '新能源车ETF', assets: 200 },
        { ticker: '515790', name: '新能源ETF', assets: 150 }
      ],
      industryChain: 'full',
      investmentTheme: '电动化+智能化双重驱动',
      marketCap: '数万亿',
      growthRate: '20-30% CAGR',
      peakYear: '2025-2030'
    }
  },

  // 创新药/医疗器械
  'biotech_root': {
    newId: 'innovative_drug',
    metadata: {
      relatedIndex: '931152',
      indexName: '中证创新药产业指数',
      trackingETFs: [
        { ticker: '159992', name: '创新药ETF', assets: 150 },
        { ticker: '159858', name: '医药ETF', assets: 200 }
      ],
      industryChain: 'full',
      investmentTheme: '创新药黄金时代',
      marketCap: '万亿级',
      growthRate: '15-25% CAGR',
      peakYear: '2025-2035'
    }
  },

  // 消费电子
  'ce_root': {
    newId: 'consumer_electronics',
    metadata: {
      relatedIndex: '399286',
      indexName: '中证消费电子主题指数',
      trackingETFs: [
        { ticker: '159732', name: '消费电子ETF', assets: 120 }
      ],
      industryChain: 'full',
      investmentTheme: '消费电子创新周期',
      marketCap: '万亿级',
      growthRate: '10-15% CAGR',
      peakYear: '2024-2028'
    }
  },

  // 军工航天
  'defense_root': {
    newId: 'defense_aerospace',
    metadata: {
      relatedIndex: '399967',
      indexName: '中证军工指数',
      trackingETFs: [
        { ticker: '512660', name: '军工ETF', assets: 150 },
        { ticker: '512810', name: '国防军工ETF', assets: 100 }
      ],
      industryChain: 'full',
      investmentTheme: '国防现代化与军民融合',
      marketCap: '万亿级',
      growthRate: '10-15% CAGR',
      peakYear: '2025-2030'
    }
  },

  // 储能/电力设备
  'energy_root': {
    newId: 'battery_storage',
    metadata: {
      relatedIndex: '399808',
      indexName: '中证新能源指数',
      trackingETFs: [
        { ticker: '516160', name: '新能源电池ETF', assets: 80 },
        { ticker: '159755', name: '电池ETF', assets: 120 }
      ],
      industryChain: 'full',
      investmentTheme: '新型储能高速增长',
      marketCap: '千亿级',
      growthRate: '50-80% CAGR',
      peakYear: '2024-2028'
    }
  },

  // 机器人/自动化
  'robotics_root': {
    newId: 'robotics',
    metadata: {
      relatedIndex: '931770',
      indexName: '中证机器人指数',
      trackingETFs: [
        { ticker: '159770', name: '机器人ETF', assets: 80 },
        { ticker: '562500', name: '人形机器人ETF', assets: 50 }
      ],
      industryChain: 'full',
      investmentTheme: '自动化+人形机器人',
      marketCap: '千亿级',
      growthRate: '20-30% CAGR',
      peakYear: '2025-2035'
    }
  },

  // 数字经济
  'digital_root': {
    newId: 'digital_economy',
    metadata: {
      relatedIndex: '931582',
      indexName: '中证云计算与大数据主题指数',
      trackingETFs: [
        { ticker: '516510', name: '中概互联ETF', assets: 180 },
        { ticker: '159870', name: '云计算ETF', assets: 80 }
      ],
      industryChain: 'full',
      investmentTheme: '数字化转型',
      marketCap: '万亿级',
      growthRate: '15-25% CAGR',
      peakYear: '2024-2030'
    }
  },

  // 先进材料
  'materials_root': {
    newId: 'advanced_materials',
    metadata: {
      relatedIndex: '399441',
      indexName: '中证新材料主题指数',
      trackingETFs: [
        { ticker: '159856', name: '新材料ETF', assets: 60 }
      ],
      industryChain: 'full',
      investmentTheme: '材料技术突破与国产替代',
      marketCap: '千亿级',
      growthRate: '12-18% CAGR',
      peakYear: '2025-2030'
    }
  },

  // 消费（需要补充）
  'consumer_root': {
    newId: 'consumer',
    metadata: {
      relatedIndex: '399971',
      indexName: '中证全指主要消费指数',
      trackingETFs: [
        { ticker: '159928', name: '消费ETF', assets: 150 }
      ],
      industryChain: 'full',
      investmentTheme: '消费升级与品牌崛起',
      marketCap: '万亿级',
      growthRate: '8-12% CAGR',
      peakYear: '2024-2030'
    }
  }
}

async function main() {
  console.log('=== 开始更新现有领域节点的市场数据 ===\n')

  let updatedCount = 0
  let skippedCount = 0

  for (const [oldId, mapping] of Object.entries(DOMAIN_MAPPINGS)) {
    console.log(`\n📊 处理领域: ${oldId}`)

    // 查找现有节点
    const existingNode = await prisma.graphNode.findUnique({
      where: { id: oldId }
    })

    if (!existingNode) {
      console.log(`   ⚠️  节点不存在，跳过`)
      skippedCount++
      continue
    }

    // 检查是否已有metadata
    if (existingNode.metadata) {
      console.log(`   ℹ️  节点已有metadata，跳过`)
      skippedCount++
      continue
    }

    // 更新节点
    try {
      await prisma.graphNode.update({
        where: { id: oldId },
        data: {
          metadata: JSON.stringify(mapping.metadata),
          description: existingNode.description || mapping.metadata.investmentTheme
        }
      })
      console.log(`   ✅ 更新成功`)
      console.log(`      - 指数: ${mapping.metadata.relatedIndex}`)
      console.log(`      - ETF: ${mapping.metadata.trackingETFs.length}个`)
      updatedCount++
    } catch (error: any) {
      console.log(`   ❌ 更新失败: ${error.message}`)
    }
  }

  console.log('\n' + '='.repeat(60))
  console.log(`\n✅ 更新完成！`)
  console.log(`   - 成功更新: ${updatedCount} 个`)
  console.log(`   - 跳过: ${skippedCount} 个`)
  console.log(`   - 总计: ${updatedCount + skippedCount} 个`)

  console.log('\n📋 下一步:')
  console.log('   1. 运行检查脚本: npx tsx scripts/check-graph-metadata.ts')
  console.log('   2. 更新L1和L2节点的metadata (需要另写脚本)')
  console.log('   3. 启动服务: npm run dev')
  console.log('   4. 访问页面: http://localhost:3000/graph/explore')

  await prisma.$disconnect()
}

main()
