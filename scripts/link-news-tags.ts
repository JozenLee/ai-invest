// 为现有新闻建立Tag关联
// 根据NewsArticle.segmentCodes字段，创建NewsArticleTag关联记录

import { prisma } from '../src/lib/db/prisma'

async function main() {
  console.log('🔗 开始为新闻建立Tag关联...\n')

  // Step 1: 获取所有有segmentCodes的新闻
  const articles = await prisma.newsArticle.findMany({
    where: {
      segmentCodes: {
        not: null,
      },
    },
  })

  console.log(`📰 找到 ${articles.length} 条有segmentCodes的新闻`)

  if (articles.length === 0) {
    console.log('⚠️ 没有新闻需要处理')
    return
  }

  // Step 2: 获取所有segment类型的Tag
  const tags = await prisma.tag.findMany({
    where: {
      type: 'segment',
      isActive: true,
    },
  })

  console.log(`🏷️  找到 ${tags.length} 个segment标签\n`)

  // 建立code到tagId的映射
  const codeToTagId = new Map<string, string>()
  tags.forEach((tag) => {
    codeToTagId.set(tag.code, tag.id)
  })

  // Step 3: 为每条新闻建立关联
  let totalLinks = 0
  let successCount = 0
  let errorCount = 0

  for (const article of articles) {
    try {
      // 解析segmentCodes
      let segmentCodes: string[] = []
      if (article.segmentCodes) {
        try {
          segmentCodes = JSON.parse(article.segmentCodes as string)
        } catch (e) {
          console.error(`  ❌ 解析segmentCodes失败: ${article.id}`)
          errorCount++
          continue
        }
      }

      if (segmentCodes.length === 0) {
        continue
      }

      // 为每个segment创建Tag关联
      for (const code of segmentCodes) {
        const tagId = codeToTagId.get(code)
        if (!tagId) {
          console.log(`  ⚠️  未找到Tag: ${code}`)
          continue
        }

        try {
          await prisma.newsArticleTag.create({
            data: {
              newsId: article.id,
              tagId: tagId,
              confidence: 1.0,
            },
          })
          totalLinks++
        } catch (e: any) {
          // 忽略重复关联错误
          if (!e.message?.includes('Unique constraint')) {
            console.error(`  ❌ 创建关联失败: ${article.id} -> ${code}`)
          }
        }
      }

      successCount++
      console.log(`  ✅ ${article.title.substring(0, 40)}... (${segmentCodes.length} 个标签)`)
    } catch (error) {
      console.error(`  ❌ 处理失败: ${article.id}`, error)
      errorCount++
    }
  }

  console.log('\n✨ 关联完成！')
  console.log(`  - 处理新闻: ${successCount}/${articles.length}`)
  console.log(`  - 创建关联: ${totalLinks}`)
  console.log(`  - 错误数: ${errorCount}\n`)

  // Step 4: 验证结果
  const linkCount = await prisma.newsArticleTag.count()
  console.log(`📊 NewsArticleTag表记录数: ${linkCount}`)
}

main()
  .then(() => {
    console.log('✅ 脚本执行成功')
    process.exit(0)
  })
  .catch((error) => {
    console.error('❌ 脚本执行失败:', error)
    process.exit(1)
  })
