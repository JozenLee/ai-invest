// src/lib/__tests__/data-client.test.ts
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { DataClient, ApiResponse } from '../data-client'

describe('DataClient', () => {
  let client: DataClient
  let mockFetch: ReturnType<typeof vi.fn>

  beforeEach(() => {
    client = new DataClient({
      baseUrl: 'http://localhost:8000',
      timeout: 1000,
      retryCount: 1,
      cacheTTL: 5,
    })
    client.clearCache()
    mockFetch = vi.fn()
    global.fetch = mockFetch as typeof fetch
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe('get()', () => {
    it('should return data on success', async () => {
      const mockData: ApiResponse<any> = {
        success: true,
        data: { indices: [] },
      }
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockData),
      })

      const result = await client.get('/api/test')

      expect(result.success).toBe(true)
      expect(result.data).toEqual({ indices: [] })
    })

    it('should return cached data on second call', async () => {
      const mockData: ApiResponse<any> = {
        success: true,
        data: { indices: [] },
      }
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockData),
      })

      await client.get('/api/test')
      const result = await client.get('/api/test')

      expect(mockFetch).toHaveBeenCalledTimes(1)
      expect(result).toEqual(mockData)
    })

    it('should retry on failure', async () => {
      mockFetch
        .mockRejectedValueOnce(new Error('Network error'))
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ success: true }),
        })

      const result = await client.get('/api/test')

      expect(mockFetch).toHaveBeenCalledTimes(2)
      expect(result.success).toBe(true)
    })

    it('should return error after all retries failed', async () => {
      mockFetch.mockRejectedValue(new Error('Network error'))

      const result = await client.get('/api/test')

      expect(result.success).toBe(false)
      expect(result.error).toContain('数据服务不可用')
    })

    it('should handle HTTP errors', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
      })

      const result = await client.get('/api/test')

      expect(result.success).toBe(false)
    })

    it('should pass params correctly', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ success: true }),
      })

      await client.get('/api/test', { key: 'value' })

      const calledUrl = mockFetch.mock.calls[0][0]
      expect(calledUrl).toContain('key=value')
    })
  })

  describe('cache', () => {
    it('should expire after TTL', async () => {
      const client = new DataClient({ cacheTTL: 0 })
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ success: true }),
      })

      await client.get('/api/test')
      await new Promise(resolve => setTimeout(resolve, 100))
      await client.get('/api/test')

      expect(mockFetch).toHaveBeenCalledTimes(2)
    })

    it('should not cache failed responses', async () => {
      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ success: false, error: 'fail' }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ success: true }),
        })

      await client.get('/api/test')
      const result = await client.get('/api/test')

      expect(mockFetch).toHaveBeenCalledTimes(2)
      expect(result.success).toBe(true)
    })
  })

  describe('clearCache()', () => {
    it('should clear all cached data', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ success: true }),
      })

      await client.get('/api/test')
      client.clearCache()
      await client.get('/api/test')

      expect(mockFetch).toHaveBeenCalledTimes(2)
    })
  })
})
