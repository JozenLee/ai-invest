// 市场数据文件缓存
// 当 Python 数据服务和 Yahoo Finance 都不可用时，返回上一次成功获取的数据
// 缓存文件存储在项目根目录 .cache/ 下

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'fs'
import { join } from 'path'

const CACHE_DIR = join(process.cwd(), '.cache')

// 确保缓存目录存在
function ensureCacheDir() {
  if (!existsSync(CACHE_DIR)) {
    mkdirSync(CACHE_DIR, { recursive: true })
  }
}

/**
 * 读取缓存的市场概览数据
 * @returns 缓存的数据，如果不存在或读取失败返回 null
 */
export function getCachedMarketOverview(): any | null {
  try {
    ensureCacheDir()
    const filePath = join(CACHE_DIR, 'market_overview.json')
    if (!existsSync(filePath)) return null

    const raw = readFileSync(filePath, 'utf-8')
    const cached = JSON.parse(raw)

    // 检查缓存是否太旧（超过24小时的数据认为过期）
    const cachedTime = new Date(cached.timestamp || 0).getTime()
    const maxAge = 24 * 60 * 60 * 1000 // 24小时
    if (Date.now() - cachedTime > maxAge) {
      console.warn('市场概览缓存已过期（超过24小时）')
      return null
    }

    return cached
  } catch (error) {
    console.warn('读取市场概览缓存失败:', error)
    return null
  }
}

/**
 * 保存市场概览数据到文件缓存
 * @param data 要缓存的市场概览数据
 */
export function setCachedMarketOverview(data: any): void {
  try {
    ensureCacheDir()
    const filePath = join(CACHE_DIR, 'market_overview.json')
    const cacheEntry = {
      ...data,
      timestamp: data.timestamp || new Date().toISOString(),
      cachedAt: new Date().toISOString(),
    }
    writeFileSync(filePath, JSON.stringify(cacheEntry, null, 2), 'utf-8')
  } catch (error) {
    console.warn('写入市场概览缓存失败:', error)
  }
}
