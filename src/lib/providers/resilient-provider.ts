import pRetry from 'p-retry'
import pLimit from 'p-limit'
import CircuitBreaker from 'opossum'

interface ProviderConfig {
  maxRetries: number // 最大重试次数，默认3
  timeout: number // 单次请求超时(ms)，默认30000
  retryDelay: number // 重试延迟(ms)，默认1000
  concurrency: number // 并发限制，默认5
  circuitBreakerOptions?: {
    timeout: number // 熔断器超时
    errorThresholdPercentage: number
    resetTimeout: number
    errorFilter?: (error: unknown) => boolean
  }
}

interface CacheEntry {
  data: any
  timestamp: number
}

export class ResilientProviderClient {
  private limiter: ReturnType<typeof pLimit>
  private breaker: CircuitBreaker
  private cache: Map<string, CacheEntry>

  constructor(
    private baseUrl: string,
    private config: ProviderConfig
  ) {
    this.limiter = pLimit(config.concurrency)
    this.cache = new Map()

    // 熔断器配置
    this.breaker = new CircuitBreaker(
      this.executeRequest.bind(this),
      config.circuitBreakerOptions || {
        timeout: 60000,
        errorThresholdPercentage: 50,
        resetTimeout: 30000,
        // Invalid endpoint parameters (4xx) are caller/data-shape errors and
        // must not take the shared provider circuit down for every workflow.
        errorFilter: (error: any) => Number(error?.status) >= 400 && Number(error?.status) < 500,
      }
    )

    // 熔断器事件监听
    this.breaker.on('open', () => {
      console.warn(`Circuit breaker opened for ${baseUrl}`)
    })
    this.breaker.on('halfOpen', () => {
      console.info(`Circuit breaker half-open for ${baseUrl}`)
    })
  }

  /**
   * 执行带重试的请求
   */
  async fetch<T>(
    path: string,
    options?: RequestInit,
    cacheKey?: string,
    cacheTTL = 300000 // 5分钟缓存
  ): Promise<T> {
    // 检查缓存
    if (cacheKey && this.cache.has(cacheKey)) {
      const cached = this.cache.get(cacheKey)!
      if (Date.now() - cached.timestamp < cacheTTL) {
        return cached.data
      }
    }

    // 并发限制 + 熔断器 + 重试
    return this.limiter(() =>
      pRetry(
        async () => {
          const result = await this.breaker.fire(path, options)

          // 缓存结果
          if (cacheKey) {
            this.cache.set(cacheKey, { data: result, timestamp: Date.now() })
          }

          return result
        },
        {
          retries: this.config.maxRetries,
          minTimeout: this.config.retryDelay,
          factor: 2, // 指数退避
          onFailedAttempt: (error) => {
            console.warn(
              `Attempt ${error.attemptNumber} failed for ${path}. ` +
                `${error.retriesLeft} retries left.`
            )
          }
        }
      )
    ) as Promise<T>
  }

  /**
   * 实际的请求执行（被熔断器包装）
   */
  private async executeRequest(
    path: string,
    options?: RequestInit
  ): Promise<any> {
    const controller = new AbortController()
    const timeoutId = setTimeout(
      () => controller.abort(),
      this.config.timeout
    )

    try {
      const response = await fetch(`${this.baseUrl}${path}`, {
        ...options,
        signal: controller.signal
      })

      if (!response.ok) {
        const error = new Error(`HTTP ${response.status}: ${response.statusText}`) as Error & { status?: number }
        error.status = response.status
        throw error
      }

      return await response.json()
    } finally {
      clearTimeout(timeoutId)
    }
  }

  /**
   * 批量请求（自动并发控制）
   */
  async fetchBatch<T>(
    requests: Array<{
      path: string
      options?: RequestInit
      cacheKey?: string
    }>,
    onProgress?: (completed: number, total: number) => void
  ): Promise<T[]> {
    let completed = 0
    const total = requests.length

    const promises = requests.map((req) =>
      this.fetch<T>(req.path, req.options, req.cacheKey).then((result) => {
        completed++
        onProgress?.(completed, total)
        return result
      })
    )

    return Promise.all(promises)
  }

  /**
   * 清理过期缓存
   */
  clearExpiredCache(maxAge: number = 300000): void {
    const now = Date.now()
    for (const [key, entry] of this.cache.entries()) {
      if (now - entry.timestamp > maxAge) {
        this.cache.delete(key)
      }
    }
  }

  /**
   * 清空所有缓存
   */
  clearCache(): void {
    this.cache.clear()
  }

  /**
   * 获取熔断器状态
   */
  getCircuitBreakerStats() {
    return {
      isOpen: this.breaker.opened,
      isHalfOpen: this.breaker.halfOpen,
      stats: this.breaker.stats
    }
  }
}
