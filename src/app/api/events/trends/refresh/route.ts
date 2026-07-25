import { NextRequest, NextResponse } from 'next/server'
import { apiCache } from '@/lib/cache'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { domain, newsCount } = body

    let clearedCount = 0

    if (domain) {
      // 清除指定领域的分析缓存
      if (newsCount) {
        // 清除特定新闻数量的缓存
        const cacheKey = `trends:analysis:${domain}:${newsCount}`
        if (apiCache.delete(cacheKey)) {
          clearedCount++
        }
      } else {
        // 清除该领域所有新闻数量的缓存
        // 注意：当前 MemoryCache 不支持通配符删除，需要遍历常用的 newsCount 值
        const commonCounts = [20, 50, 100, 200]
        for (const count of commonCounts) {
          const cacheKey = `trends:analysis:${domain}:${count}`
          if (apiCache.delete(cacheKey)) {
            clearedCount++
          }
        }
      }
    } else {
      // 清除所有领域的摘要缓存
      const commonCounts = [20, 50, 100, 200]
      for (const count of commonCounts) {
        const cacheKey = `trends:summary:${count}`
        if (apiCache.delete(cacheKey)) {
          clearedCount++
        }
      }
    }

    return NextResponse.json({
      success: true,
      message: `已清除 ${clearedCount} 个缓存项`,
      cleared: clearedCount,
    })
  } catch (error) {
    console.error('清除趋势缓存失败:', error)

    return NextResponse.json(
      {
        success: false,
        error: '清除缓存失败',
      },
      { status: 500 }
    )
  }
}
