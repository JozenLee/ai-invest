/**
 * 测试咨询流页面筛选框显示
 * 确保所有选项都显示中文，没有英文
 */

import { EVENTS_TEXT } from '../src/constants/events-text'

console.log('================================')
console.log('验证筛选框文本常量')
console.log('================================\n')

console.log('1. 情感筛选选项:')
console.log(`   - 全部情感: "${EVENTS_TEXT.feed.filter.sentimentAll}"`)
console.log(`   - 利好: "${EVENTS_TEXT.feed.filter.sentimentBullish}"`)
console.log(`   - 中性: "${EVENTS_TEXT.feed.filter.sentimentNeutral}"`)
console.log(`   - 利空: "${EVENTS_TEXT.feed.filter.sentimentBearish}"`)

console.log('\n2. 排序选项:')
console.log(`   - 最新发布: "${EVENTS_TEXT.feed.filter.sortByTime}"`)
console.log(`   - 情感最强: "${EVENTS_TEXT.feed.filter.sortBySentiment}"`)
console.log(`   - 影响力最高: "${EVENTS_TEXT.feed.filter.sortByImpact}"`)

console.log('\n3. 通用文本:')
console.log(`   - 全部: "${EVENTS_TEXT.common.all}"`)

console.log('\n================================')
console.log('验证筛选逻辑')
console.log('================================\n')

// 模拟前端逻辑
const sentimentDisplayMap: Record<string, string> = {
  'all': EVENTS_TEXT.feed.filter.sentimentAll,
  'bullish': EVENTS_TEXT.feed.filter.sentimentBullish,
  'neutral': EVENTS_TEXT.feed.filter.sentimentNeutral,
  'bearish': EVENTS_TEXT.feed.filter.sentimentBearish,
}

const sortDisplayMap: Record<string, string> = {
  'publishTime': EVENTS_TEXT.feed.filter.sortByTime,
  'sentiment': EVENTS_TEXT.feed.filter.sortBySentiment,
  'impact': EVENTS_TEXT.feed.filter.sortByImpact,
}

console.log('4. 情感筛选值 → 显示映射:')
Object.entries(sentimentDisplayMap).forEach(([key, value]) => {
  console.log(`   - value="${key}" → 显示="${value}"`)
})

console.log('\n5. 排序筛选值 → 显示映射:')
Object.entries(sortDisplayMap).forEach(([key, value]) => {
  console.log(`   - value="${key}" → 显示="${value}"`)
})

console.log('\n================================')
console.log('检查结果')
console.log('================================\n')

const hasEnglish = (text: string) => /[a-zA-Z]/.test(text)

let allPassed = true

// 检查所有显示文本是否包含英文
const textsToCheck = [
  ...Object.values(sentimentDisplayMap),
  ...Object.values(sortDisplayMap),
]

textsToCheck.forEach(text => {
  if (hasEnglish(text)) {
    console.log(`✗ 发现英文: "${text}"`)
    allPassed = false
  }
})

if (allPassed) {
  console.log('✓ 所有显示文本均为中文')
  console.log('✓ 筛选框应该正确显示中文')
} else {
  console.log('✗ 存在英文文本，需要修复')
}

console.log('\n================================\n')
