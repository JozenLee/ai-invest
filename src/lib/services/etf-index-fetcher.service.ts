// ETF和指数列表获取服务
// 从Python数据服务获取完整的ETF和指数列表

export interface ETFItem {
  ticker: string
  name: string
  price: number
  changePct: number
  volume: number
}

export interface IndexItem {
  code: string
  name: string
  price: number
  change: number
  changePct: number
  volume: number
  amount: number
}

interface CacheEntry<T> {
  data: T
  timestamp: number
}

class ETFIndexFetcher {
  private cache: Map<string, CacheEntry<any>> = new Map()
  private readonly CACHE_TTL = 3600000 // 1小时缓存

  private dataServiceUrl = process.env.NEXT_PUBLIC_DATA_SERVICE_URL || 'http://localhost:8000'

  /**
   * 获取ETF列表
   */
  async getETFList(options?: {
    category?: string
    limit?: number
    forceRefresh?: boolean
  }): Promise<ETFItem[]> {
    const cacheKey = `etf_list_${options?.category || 'all'}_${options?.limit || 100}`

    // 检查缓存
    if (!options?.forceRefresh) {
      const cached = this.getFromCache<ETFItem[]>(cacheKey)
      if (cached) {
        return cached
      }
    }

    try {
      const params = new URLSearchParams()
      if (options?.category) params.append('category', options.category)
      if (options?.limit) params.append('limit', options.limit.toString())

      const response = await fetch(
        `${this.dataServiceUrl}/api/etf/list?${params.toString()}`,
        { signal: AbortSignal.timeout(15000) }
      )

      if (!response.ok) {
        throw new Error(`获取ETF列表失败: ${response.statusText}`)
      }

      const result = await response.json()
      if (!result.success) {
        throw new Error(result.error || '获取ETF列表失败')
      }

      const data = result.data as ETFItem[]
      this.setCache(cacheKey, data)
      return data
    } catch (error) {
      console.error('获取ETF列表失败:', error)
      // 返回缓存（即使过期）
      const cached = this.cache.get(cacheKey)
      if (cached) {
        console.warn('使用过期缓存数据')
        return cached.data
      }
      return []
    }
  }

  /**
   * 获取指数列表
   */
  async getIndexList(options?: { forceRefresh?: boolean }): Promise<IndexItem[]> {
    const cacheKey = 'index_list'

    // 检查缓存
    if (!options?.forceRefresh) {
      const cached = this.getFromCache<IndexItem[]>(cacheKey)
      if (cached) {
        return cached
      }
    }

    try {
      const response = await fetch(
        `${this.dataServiceUrl}/api/market/indices`,
        { signal: AbortSignal.timeout(15000) }
      )

      if (!response.ok) {
        throw new Error(`获取指数列表失败: ${response.statusText}`)
      }

      const result = await response.json()
      if (!result.success) {
        throw new Error(result.error || '获取指数列表失败')
      }

      const data = result.data.indices as IndexItem[]
      this.setCache(cacheKey, data)
      return data
    } catch (error) {
      console.error('获取指数列表失败:', error)
      // 返回缓存（即使过期）
      const cached = this.cache.get(cacheKey)
      if (cached) {
        console.warn('使用过期缓存数据')
        return cached.data
      }
      return []
    }
  }

  /**
   * 从缓存获取数据
   */
  private getFromCache<T>(key: string): T | null {
    const cached = this.cache.get(key)
    if (!cached) return null

    const age = Date.now() - cached.timestamp
    if (age > this.CACHE_TTL) {
      this.cache.delete(key)
      return null
    }

    return cached.data as T
  }

  /**
   * 设置缓存
   */
  private setCache<T>(key: string, data: T): void {
    this.cache.set(key, {
      data,
      timestamp: Date.now(),
    })
  }

  /**
   * 清除缓存
   */
  clearCache(): void {
    this.cache.clear()
  }
}

export const etfIndexFetcher = new ETFIndexFetcher()
