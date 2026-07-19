#!/usr/bin/env tsx
/**
 * 修复新闻分类映射
 * 将 category 字段（代码）映射到 categoryId 字段（外键）
 */

import prisma from '../src/lib/db/prisma'

// category code 到 categoryId 的映射
const categoryMapping: Record<string, string> = {
  // 科技类
  'ai': 'cat_ai',
  'chip': 'cat_chip',
  'tech': 'cat_breakthrough',
  'internet': 'cat_internet',

  // 财经类
  'finance': 'cat_macro',
  'capital': 'cat_capital',
  'earnings': 'cat_earnings',

  // 产业类
  'supply': 'cat_supply',
  'capacity': 'cat_capacity',
  'competition': 'cat_competition',
  'new_energy': 'cat_new_energy',
  'medical': 'cat_medical',

  // 政策类
  'policy': 'cat_policy',
  'regulation': 'cat_regulation',
  'government': 'cat_government',
  'politics': 'cat_policy',

  // 国际类
  'geopolitics': 'cat_geopolitics',
  'global_market': 'cat_global_market',
  'trade': 'cat_trade',
  'international': 'cat_geopolitics',

  // 其他
  'society': 'cat_society',
  'event': 'cat_event',
  'consume': 'cat_consume',
  'merger': 'cat_merger',
  'market': 'cat_global_market',
  'product': 'cat_product',
  'partnership': 'cat_merger',
  'breakthrough': 'cat_breakthrough',
}

async function main() {
  console.log('🔍 开始修复新闻分类映射...\n')

  // 查找所有 categoryId 为空的新闻
  const articlesWithoutCategoryId = await prisma.newsArticle.findMany({
    where: {
      OR: [
        { categoryId: null },
        { categoryId: '' }
      ]
    },
    select: {
      id: true,
      title: true,
      category: true,
      categoryId: true,
    }
  })

  console.log(`📊 找到 ${articlesWithoutCategoryId.length} 条需要修复的新闻\n`)

  let fixed = 0
  let skipped = 0

  for (const article of articlesWithoutCategoryId) {
    const categoryCode = article.category || ''
    const mappedCategoryId = categoryMapping[categoryCode]

    if (mappedCategoryId) {
      // 验证目标分类是否存在
      const categoryExists = await prisma.newsCategory.findUnique({
        where: { id: mappedCategoryId }
      })

      if (categoryExists) {
        await prisma.newsArticle.update({
          where: { id: article.id },
          data: { categoryId: mappedCategoryId }
        })
        console.log(`✅ [${article.id}] ${categoryCode} -> ${mappedCategoryId}: ${article.title.slice(0, 50)}`)
        fixed++
      } else {
        console.log(`⚠️  [${article.id}] 分类不存在: ${mappedCategoryId}`)
        skipped++
      }
    } else {
      console.log(`⚠️  [${article.id}] 无法映射分类: ${categoryCode} - ${article.title.slice(0, 50)}`)
      skipped++
    }
  }

  console.log(`\n📈 修复完成:`)
  console.log(`  - 已修复: ${fixed} 条`)
  console.log(`  - 已跳过: ${skipped} 条`)

  // 验证结果
  const remainingWithoutCategoryId = await prisma.newsArticle.count({
    where: {
      OR: [
        { categoryId: null },
        { categoryId: '' }
      ]
    }
  })

  console.log(`  - 剩余未分类: ${remainingWithoutCategoryId} 条\n`)
}

main()
  .then(() => {
    console.log('✨ 修复脚本执行完成')
    process.exit(0)
  })
  .catch((error) => {
    console.error('❌ 修复失败:', error)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
