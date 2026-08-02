#!/usr/bin/env tsx
/**
 * 测试知识图谱市场数据功能
 * 验证数据源、节点映射、市场数据增强服务
 */

import prisma from '../src/lib/db/prisma'
import { graphMarketDataService } from '../src/lib/services/graph-market-data.service'

async function testGraphMarketData() {
  console.log('=== 测试知识图谱市场数据 ===\n')

  try {
    // 1. 检查图谱节点
    console.log('1️⃣ 检查图谱节点...')
    const totalNodes = await prisma.graphNode.count()
    console.log(`   总节点数: ${totalNodes}`)

    const nodesWithMetadata = await prisma.graphNode.count({
      where: { metadata: { not: null } }
    })
    console.log(`   有metadata的节点: ${nodesWithMetadata}\n`)

    // 2. 检查市场数据
    console.log('2️⃣ 检查市场数据表...')
    const indexCount = await prisma.indexDaily.count()
    const etfCount = await prisma.eTFDaily.count()
    const flowCount = await prisma.sectorCapitalFlow.count()
    const linkCount = await prisma.newsGraphLink.count()

    console.log(`   IndexDaily: ${indexCount} 条`)
    console.log(`   ETFDaily: ${etfCount} 条`)
    console.log(`   SectorCapitalFlow: ${flowCount} 条`)
    console.log(`   NewsGraphLink: ${linkCount} 条\n`)

    // 3. 测试市场数据增强
    console.log('3️⃣ 测试市场数据增强服务...')

    // 查找AI算力节点
    const aiNode = await prisma.graphNode.findFirst({
      where: { name: 'AI算力' }
    })

    if (aiNode) {
      console.log(`   测试节点: ${aiNode.name} (${aiNode.id})`)

      // 检查metadata
      if (aiNode.metadata) {
        const metadata = JSON.parse(aiNode.metadata as string)
        console.log(`   relatedIndex: ${metadata.relatedIndex || '无'}`)
        console.log(`   trackingETFs: ${metadata.trackingETFs?.length || 0} 个`)
      }

      // 增强市场数据
      const enhanced = await graphMarketDataService.enhanceNode(aiNode as any)

      console.log('\n   📊 市场数据增强结果:')

      if (enhanced.marketData?.indexPerformance) {
        const idx = enhanced.marketData.indexPerformance
        console.log(`   ✅ 指数表现: ${idx.name}`)
        console.log(`      - 1日涨跌: ${idx.changePct1d?.toFixed(2)}%`)
        console.log(`      - 5日涨跌: ${idx.changePct5d?.toFixed(2)}%`)
        console.log(`      - 30日涨跌: ${idx.changePct30d?.toFixed(2)}%`)
      } else {
        console.log(`   ❌ 指数表现: 无数据`)
      }

      if (enhanced.marketData?.etfTracking && enhanced.marketData.etfTracking.length > 0) {
        console.log(`   ✅ ETF跟踪: ${enhanced.marketData.etfTracking.length} 个`)
        enhanced.marketData.etfTracking.forEach(etf => {
          console.log(`      - ${etf.name}: 5日涨跌 ${etf.changePct5d?.toFixed(2)}%`)
        })
      } else {
        console.log(`   ❌ ETF跟踪: 无数据`)
      }

      if (enhanced.marketData?.capitalFlow) {
        const flow = enhanced.marketData.capitalFlow
        console.log(`   ✅ 资金流向:`)
        console.log(`      - 主力净流入(1日): ${(flow.mainForceNet1d! / 10000).toFixed(2)}亿`)
        console.log(`      - 主力净流入(5日): ${(flow.mainForceNet5d! / 10000).toFixed(2)}亿`)
        console.log(`      - 资金情绪: ${flow.sentiment}`)
      } else {
        console.log(`   ❌ 资金流向: 无数据`)
      }

      if (enhanced.marketData?.newsHeat) {
        const heat = enhanced.marketData.newsHeat
        console.log(`   ✅ 新闻热度:`)
        console.log(`      - 7日新闻: ${heat.count7d} 条`)
        console.log(`      - 30日新闻: ${heat.count30d} 条`)
        console.log(`      - 情感: ${heat.sentimentLabel || '无'}`)
        if (heat.topKeywords && heat.topKeywords.length > 0) {
          console.log(`      - 关键词: ${heat.topKeywords.join(', ')}`)
        }
      } else {
        console.log(`   ⚠️  新闻热度: 无数据`)
      }

      if (enhanced.marketData?.marketCognition) {
        const cog = enhanced.marketData.marketCognition
        console.log(`   ✅ 市场认知:`)
        console.log(`      - 机构关注度: ${cog.institutionalAttention}/100`)
        console.log(`      - 散户关注度: ${cog.retailAttention}/100`)
      }

      if (enhanced.marketData?.aiComputeMetrics) {
        const ai = enhanced.marketData.aiComputeMetrics
        console.log(`   ✅ AI算力指标:`)
        if (ai.gpuSupplyTightness !== undefined) {
          console.log(`      - GPU供应紧张度: ${ai.gpuSupplyTightness}/100`)
        }
        if (ai.nvidiaCycle) {
          console.log(`      - NVIDIA周期: ${ai.nvidiaCycle}`)
        }
      }
    } else {
      console.log('   ❌ 未找到AI算力节点')
    }

    // 4. 检查指数代码映射
    console.log('\n4️⃣ 检查指数代码映射...')
    const latestIndex = await prisma.indexDaily.findFirst({
      orderBy: { date: 'desc' }
    })

    if (latestIndex) {
      console.log(`   最新指数数据: ${latestIndex.name} (${latestIndex.code})`)
      console.log(`   日期: ${latestIndex.date}`)
      console.log(`   收盘价: ${latestIndex.close}`)
    }

    console.log('\n=== 测试完成 ===')

  } catch (error) {
    console.error('测试失败:', error)
  } finally {
    await prisma.$disconnect()
  }
}

// 运行测试
testGraphMarketData()
