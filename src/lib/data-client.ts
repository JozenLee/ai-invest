// src/lib/data-client.ts
// 统一数据客户端
// 所有前端数据获取通过此客户端，自动处理缓存、重试、错误

export interface ApiResponse<T> {
  success: boolean
  data?: T
  error?: string
  source?: string
}

interface DataClientConfig {
  baseUrl: string
  timeout: number
  retryCount: number
  cacheTTL: number
}

export class DataClient {
  private config: DataClientConfig
  private cache: Map<string, { data: ApiResponse<any>; expiry: number }>

  constructor(config?: Partial<DataClientConfig>) {
    this.config = {
      baseUrl: process.env.DATA_SERVICE_URL || 'http://localhost:8000',
      timeout: 15000,
      retryCount: 2,
      cacheTTL: 30,
      ...config,
    }
    this.cache = new Map()
  }

  async get<T>(endpoint: string, params?: Record<string, string>): Promise<ApiResponse<T>> {
    const url = this.buildUrl(endpoint, params)
    const cacheKey = url.toString()

    // 检查缓存
    const cached = this.getFromCache(cacheKey)
    if (cached) return cached as ApiResponse<T>

    // 带重试的请求
    const response = await this.fetchWithRetry<T>(url)

    // 写入缓存
    if (response.success) {
      this.setCache(cacheKey, response, this.config.cacheTTL)
    }

    return response
  }

  private buildUrl(endpoint: string, params?: Record<string, string>): URL {
    const url = new URL(endpoint, this.config.baseUrl)
    if (params) {
      Object.entries(params).forEach(([key, value]) => {
        url.searchParams.set(key, value)
      })
    }
    return url
  }

  private getFromCache(key: string): ApiResponse<any> | null {
    const cached = this.cache.get(key)
    if (cached && cached.expiry > Date.now()) {
      return cached.data
    }
    if (cached) {
      this.cache.delete(key)
    }
    return null
  }

  private setCache(key: string, data: ApiResponse<any>, ttlSeconds: number): void {
    this.cache.set(key, {
      data,
      expiry: Date.now() + ttlSeconds * 1000,
    })
  }

  private async fetchWithRetry<T>(url: URL, attempt = 0): Promise<ApiResponse<T>> {
    try {
      const response = await fetch(url.toString(), {
        signal: AbortSignal.timeout(this.config.timeout),
      })

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`)
      }

      return await response.json()
    } catch (error) {
      if (attempt < this.config.retryCount) {
        return this.fetchWithRetry<T>(url, attempt + 1)
      }
      return {
        success: false,
        error: `数据服务不可用: ${error instanceof Error ? error.message : String(error)}`,
      }
    }
  }

  clearCache(): void {
    this.cache.clear()
  }
}

export const dataClient = new DataClient()
