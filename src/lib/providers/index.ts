import { ResilientProviderClient } from './resilient-provider'

// 市场数据提供者
export const marketDataProvider = new ResilientProviderClient(
  process.env.DATA_SERVICE_URL || 'http://localhost:8000',
  {
    maxRetries: 3,
    timeout: 30000,
    retryDelay: 1000,
    concurrency: 5,
    circuitBreakerOptions: {
      timeout: 60000,
      errorThresholdPercentage: 50,
      resetTimeout: 30000,
      errorFilter: (error: unknown) => {
        const status = typeof error === 'object' && error !== null && 'status' in error ? Number((error as { status?: unknown }).status) : 0
        return status >= 400 && status < 500
      },
    }
  }
)

// 新闻数据提供者
export const newsProvider = new ResilientProviderClient(
  process.env.DATA_SERVICE_URL || 'http://localhost:8000',
  {
    maxRetries: 2,
    timeout: 20000,
    retryDelay: 500,
    concurrency: 3,
    circuitBreakerOptions: {
      timeout: 45000,
      errorThresholdPercentage: 60,
      resetTimeout: 20000,
      errorFilter: (error: unknown) => {
        const status = typeof error === 'object' && error !== null && 'status' in error ? Number((error as { status?: unknown }).status) : 0
        return status >= 400 && status < 500
      },
    }
  }
)

// 行业数据提供者
export const industryProvider = new ResilientProviderClient(
  process.env.DATA_SERVICE_URL || 'http://localhost:8000',
  {
    maxRetries: 3,
    timeout: 45000,
    retryDelay: 1000,
    concurrency: 3,
    circuitBreakerOptions: {
      timeout: 90000,
      errorThresholdPercentage: 50,
      resetTimeout: 30000,
      errorFilter: (error: unknown) => {
        const status = typeof error === 'object' && error !== null && 'status' in error ? Number((error as { status?: unknown }).status) : 0
        return status >= 400 && status < 500
      },
    }
  }
)
