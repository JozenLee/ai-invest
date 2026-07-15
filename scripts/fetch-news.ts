// 新闻定时采集脚本
// 用法: npx tsx scripts/fetch-news.ts
// 建议crontab: */15 9-15 * * 1-5 npx tsx /path/to/scripts/fetch-news.ts

const NEXTJS_URL = process.env.NEXTJS_URL || 'http://localhost:3000'
const CRON_KEY = process.env.CRON_SECRET_KEY || 'ai-invest-cron-2024'

async function fetchNews() {
  try {
    const response = await fetch(`${NEXTJS_URL}/api/events/cron?key=${CRON_KEY}`, {
      signal: AbortSignal.timeout(60000),
    })

    const data = await response.json()
    console.log(`[${new Date().toISOString()}] 新闻采集结果:`, JSON.stringify(data, null, 2))

    if (!data.success) {
      console.error('采集失败:', data.error)
      process.exit(1)
    }
  } catch (error) {
    console.error('采集脚本执行失败:', error)
    process.exit(1)
  }
}

fetchNews()
