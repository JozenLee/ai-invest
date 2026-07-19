#!/usr/bin/env tsx
/**
 * 清理测试数据
 * 删除包含测试URL、测试标题的无效新闻数据
 */

import prisma from '../src/lib/db/prisma'

// 测试数据特征
const TEST_PATTERNS = {
  urls: [
    'https://example.com',
    'https://test.com',
    'http://example.com',
    'http://test.com',
    'example.com/news',
  ],
  sources: [
    '测试数据源',
    'test',
    'Test',
    '测试',
  ],
  titlePatterns: [
    /^测试/,
    /^test/i,
    /测试文章/,
    /test article/i,
  ],
  idPatterns: [
    /^news-\d+$/,  // news-001, news-002 等
  ]
}

async function identifyTestData() {
  const articles = await prisma.newsArticle.findMany({
    select: {
      id: true,
      title: true,
      url: true,
      source: true,
      publishTime: true,
    }
  })

  const testArticles: Array<{
    id: string
    title: string
    url: string | null
    source: string
    reason: string
  }> = []

  for (const article of articles) {
    let reason = ''

    // 检查ID模式
    if (TEST_PATTERNS.idPatterns.some(pattern => pattern.test(article.id))) {
      reason = 'ID符合测试模式'
    }

    // 检查URL
    else if (article.url && TEST_PATTERNS.urls.some(testUrl => article.url?.includes(testUrl))) {
      reason = 'URL包含测试域名'
    }

    // 检查来源
    else if (TEST_PATTERNS.sources.some(testSource => article.source.includes(testSource))) {
      reason = '来源为测试数据源'
    }

    // 检查标题
    else if (TEST_PATTERNS.titlePatterns.some(pattern => pattern.test(article.title))) {
      reason = '标题包含测试关键词'
    }

    if (reason) {
      testArticles.push({
        id: article.id,
        title: article.title,
        url: article.url,
        source: article.source,
        reason,
      })
    }
  }

  return testArticles
}

async function main() {
  console.log('🔍 开始识别测试数据...\n')

  // 识别测试数据
  const testArticles = await identifyTestData()

  if (testArticles.length === 0) {
    console.log('✅ 未发现测试数据，数据库干净\n')
    return
  }

  console.log(`📊 发现 ${testArticles.length} 条测试数据:\n`)

  // 显示详情
  testArticles.forEach((article, index) => {
    console.log(`${index + 1}. [${article.id}]`)
    console.log(`   标题: ${article.title}`)
    console.log(`   URL: ${article.url || '无'}`)
    console.log(`   来源: ${article.source}`)
    console.log(`   原因: ${article.reason}`)
    console.log()
  })

  // 执行删除
  console.log('🗑️  开始删除测试数据...\n')

  let deleted = 0
  for (const article of testArticles) {
    try {
      await prisma.newsArticle.delete({
        where: { id: article.id }
      })
      console.log(`✅ 已删除: ${article.title.slice(0, 50)}`)
      deleted++
    } catch (error) {
      console.error(`❌ 删除失败 [${article.id}]:`, error)
    }
  }

  console.log(`\n📈 清理完成:`)
  console.log(`  - 识别测试数据: ${testArticles.length} 条`)
  console.log(`  - 成功删除: ${deleted} 条`)
  console.log(`  - 删除失败: ${testArticles.length - deleted} 条`)

  // 验证结果
  const remainingCount = await prisma.newsArticle.count()
  console.log(`  - 剩余新闻: ${remainingCount} 条\n`)

  // 显示剩余数据的统计
  const remainingBySource = await prisma.newsArticle.groupBy({
    by: ['source'],
    _count: true,
    orderBy: { _count: { source: 'desc' } }
  })

  console.log('📊 剩余数据来源分布:')
  remainingBySource.forEach(item => {
    console.log(`  - ${item.source}: ${item._count} 条`)
  })
}

main()
  .then(() => {
    console.log('\n✨ 清理脚本执行完成')
    process.exit(0)
  })
  .catch((error) => {
    console.error('❌ 清理失败:', error)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
