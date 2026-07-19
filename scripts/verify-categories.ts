#!/usr/bin/env tsx
/**
 * 分类配置验证脚本（TypeScript版本）
 * 验证 src/config/categories.ts 配置的正确性
 */

import {
  CATEGORIES,
  CATEGORY_GROUPS,
  getAllCategoryCodes,
  getAllCategoryIds,
  getCategoriesByGroup,
  getCategoryByCode,
  generateAICategoryPrompt,
  generateUIFilterGroups,
} from '../src/config/categories'

function main() {
  console.log('='.repeat(60))
  console.log('分类配置验证（TypeScript）')
  console.log('='.repeat(60))

  let hasError = false

  // 1. 基本统计
  console.log(`\n✅ 总分类数: ${CATEGORIES.length}`)
  console.log(`✅ 分组数: ${Object.keys(CATEGORY_GROUPS).length}`)

  // 2. 检查重复
  const codes = getAllCategoryCodes()
  const ids = getAllCategoryIds()

  const uniqueCodes = new Set(codes)
  const uniqueIds = new Set(ids)

  if (codes.length !== uniqueCodes.size) {
    console.error('❌ 发现重复的分类代码!')
    const duplicates = codes.filter((code, index) => codes.indexOf(code) !== index)
    console.error(`   重复: ${[...new Set(duplicates)].join(', ')}`)
    hasError = true
  } else {
    console.log('✅ 分类代码无重复')
  }

  if (ids.length !== uniqueIds.size) {
    console.error('❌ 发现重复的分类ID!')
    const duplicates = ids.filter((id, index) => ids.indexOf(id) !== index)
    console.error(`   重复: ${[...new Set(duplicates)].join(', ')}`)
    hasError = true
  } else {
    console.log('✅ 分类ID无重复')
  }

  // 3. 按分组统计
  const grouped = getCategoriesByGroup()
  console.log(`\n📊 分组统计:`)
  for (const [groupKey, groupInfo] of Object.entries(CATEGORY_GROUPS)) {
    const count = grouped[groupKey as keyof typeof grouped]?.length || 0
    console.log(`   ${groupInfo.name}: ${count}个`)
  }

  // 4. 验证分类代码列表
  console.log(`\n📝 所有分类代码 (${codes.length}个):`)
  console.log(`   ${codes.join(', ')}`)

  // 5. 测试查找函数
  console.log(`\n🔍 测试查找功能:`)
  const testCat = getCategoryByCode('ai')
  if (testCat) {
    console.log(`   ✅ 找到 'ai': ${testCat.name} (${testCat.id})`)
  } else {
    console.error(`   ❌ 无法找到 'ai'`)
    hasError = true
  }

  // 6. 验证AI Prompt生成
  const prompt = generateAICategoryPrompt()
  if (prompt.length > 100 && prompt.includes('22个类别')) {
    console.log(`   ✅ AI Prompt生成成功 (${prompt.length}字符)`)
  } else {
    console.error(`   ❌ AI Prompt生成失败`)
    hasError = true
  }

  // 7. 验证UI筛选器生成
  const filterGroups = generateUIFilterGroups()
  if (filterGroups.length > 0) {
    console.log(`   ✅ UI筛选器生成成功 (${filterGroups.length}个分组)`)
  } else {
    console.error(`   ❌ UI筛选器生成失败`)
    hasError = true
  }

  // 8. 验证关键词
  console.log(`\n🔑 关键词验证:`)
  const totalKeywords = CATEGORIES.reduce((sum, cat) => sum + cat.keywords.length, 0)
  console.log(`   ✅ 总关键词数: ${totalKeywords}`)

  // 检查是否有空关键词
  const emptyKeywords = CATEGORIES.filter(cat => cat.keywords.length === 0)
  if (emptyKeywords.length > 0) {
    console.warn(`   ⚠️  缺少关键词的分类: ${emptyKeywords.map(c => c.name).join(', ')}`)
  }

  // 9. 验证命名规范
  console.log(`\n📏 命名规范检查:`)
  const invalidCodes = CATEGORIES.filter(cat => !/^[a-z_]+$/.test(cat.code))
  const invalidIds = CATEGORIES.filter(cat => !/^cat_[a-z_]+$/.test(cat.id))

  if (invalidCodes.length > 0) {
    console.error(`   ❌ 不符合规范的code: ${invalidCodes.map(c => c.code).join(', ')}`)
    hasError = true
  } else {
    console.log(`   ✅ 所有code符合命名规范`)
  }

  if (invalidIds.length > 0) {
    console.error(`   ❌ 不符合规范的id: ${invalidIds.map(c => c.id).join(', ')}`)
    hasError = true
  } else {
    console.log(`   ✅ 所有id符合命名规范`)
  }

  // 10. 验证code和id的对应关系
  console.log(`\n🔗 验证code和id对应:`)
  const mismatch = CATEGORIES.filter(cat => cat.id !== `cat_${cat.code}`)
  if (mismatch.length > 0) {
    console.error(`   ❌ code和id不对应:`)
    mismatch.forEach(cat => {
      console.error(`      ${cat.code} -> ${cat.id} (预期: cat_${cat.code})`)
    })
    hasError = true
  } else {
    console.log(`   ✅ 所有code和id正确对应`)
  }

  console.log('\n' + '='.repeat(60))
  if (hasError) {
    console.error('❌ 验证失败，请修复上述错误')
    console.log('='.repeat(60))
    process.exit(1)
  } else {
    console.log('✅ 所有验证通过!')
    console.log('='.repeat(60))
    process.exit(0)
  }
}

main()
