// 新闻清理定时任务
// 建议通过 cron 每天执行一次: 0 2 * * * npx tsx scripts/cleanup-news.ts

import { eventService } from '../src/lib/services/event.service'

async function main() {
  console.log('=== 新闻清理任务开始 ===')
  console.log('执行时间:', new Date().toISOString())

  try {
    // 获取清理前的统计
    const statsBefore = await eventService.getNewsStats()
    console.log('清理前统计:', statsBefore)

    // 执行清理（保留7天）
    const result = await eventService.cleanupExpiredNews(7)
    console.log('清理结果:', result)

    // 获取清理后的统计
    const statsAfter = await eventService.getNewsStats()
    console.log('清理后统计:', statsAfter)

    console.log('=== 新闻清理任务完成 ===')
  } catch (error) {
    console.error('新闻清理任务失败:', error)
    process.exit(1)
  }

  process.exit(0)
}

main()
