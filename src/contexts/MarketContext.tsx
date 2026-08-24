'use client'

import { createContext, useContext, useState, useEffect, useCallback, useMemo, ReactNode } from 'react'
import type {
  IndexData,
  CapitalFlowData,
  NorthboundData,
  MarketMeta,
  MarketContextValue,
  SourceDisplay,
  StatusBadge,
  SentimentDisplay,
} from '@/types/market'
import { SOURCE_MAP, SENTIMENT_THRESHOLDS } from '@/types/market'

const MarketContext = createContext<MarketContextValue | null>(null)

export function useMarketContext(): MarketContextValue {
  const context = useContext(MarketContext)
  if (!context) {
    throw new Error('useMarketContext must be used within MarketProvider')
  }
  return context
}

interface MarketProviderProps {
  children: ReactNode
}

export function MarketProvider({ children }: MarketProviderProps) {
  const [indices, setIndices] = useState<IndexData[]>([])
  const [capitalFlow, setCapitalFlow] = useState<CapitalFlowData | null>(null)
  const [northbound, setNorthbound] = useState<NorthboundData | null>(null)
  const [sentiment, setSentiment] = useState<number>(50)
  const [marketMeta, setMarketMeta] = useState<MarketMeta | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [source, setSource] = useState<string>('loading')
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null)

  const fetchData = useCallback(async (forceRefresh = false) => {
    if (process.env.NODE_ENV === 'development') {
      console.log('[MarketContext] 开始获取数据...', { forceRefresh })
    }
    setIsLoading(true)
    setError(null)

    try {
      // Increased timeout to 15s to accommodate slower network/API responses
      const clientTimeout = AbortSignal.timeout(15000)

      const startTime = Date.now()

      // Add refresh query parameter if force refresh requested
      const refreshParam = forceRefresh ? '?refresh=true' : ''

      // Parallel requests for index data, capital flow data, and sector data
      const [overviewRes, capitalRes, sectorRes] = await Promise.all([
        fetch(`/api/market/overview${refreshParam}`, { signal: clientTimeout }),
        fetch(`/api/market/capital-flow${refreshParam}`, { signal: clientTimeout }),
        fetch(`/api/market/sectors${refreshParam}`, { signal: clientTimeout }),
      ])

      const fetchDuration = Date.now() - startTime
      if (process.env.NODE_ENV === 'development') {
        console.log(`[MarketContext] API 请求完成 (${fetchDuration}ms)`)
        console.log(`  - overview: ${overviewRes.status}`)
        console.log(`  - capital-flow: ${capitalRes.status}`)
        console.log(`  - sectors: ${sectorRes.status}`)
      }

      // Process index data
      if (overviewRes.ok) {
        const overviewData = await overviewRes.json()
        if (overviewData.success && overviewData.data?.indices) {
          setIndices(overviewData.data.indices)
          setSource(overviewData.source || 'unknown')
          if (overviewData.data?.meta) {
            setMarketMeta(overviewData.data.meta)
          }
        } else {
          setIndices([])
          if (overviewData.error) {
            setError(overviewData.error)
          }
          if (overviewData.meta) {
            setMarketMeta(overviewData.meta)
          }
        }
      } else {
        console.error('[MarketContext] overview 请求失败:', overviewRes.status)
        setIndices([])
      }

      // Process capital flow data
      if (capitalRes.ok) {
        const capitalData = await capitalRes.json()

        // Defensive check: ensure not empty object
        if (!capitalData || Object.keys(capitalData).length === 0) {
          console.error('[MarketContext] capital-flow 返回空对象')
          setCapitalFlow(null)
        } else {
          if (capitalData.success && capitalData.data) {
            setCapitalFlow(capitalData.data)

            // Extract northbound data (unified structure)
            if (capitalData.data.northbound) {
              const nb = capitalData.data.northbound
              // Validate: must have net value and it must be a non-NaN number
              if (nb && typeof nb.net === 'number' && !isNaN(nb.net)) {
                setNorthbound(nb)
              } else {
                console.warn('[MarketContext] Invalid northbound data:', nb)
                setNorthbound(null)
              }
            }

            // Extract sentiment index
            if (capitalData.data.market?.sentiment !== undefined) {
              setSentiment(capitalData.data.market.sentiment)
            }

            // Prefer capital flow's source (more precise)
            if (capitalData.data.source) {
              setSource(capitalData.data.source)
            } else if (capitalData.source) {
              setSource(capitalData.source)
            }

            // Prefer capital flow's meta (more complete)
            if (capitalData.data?.meta || capitalData.meta) {
              setMarketMeta(capitalData.data?.meta || capitalData.meta)
            }
          } else {
            // Data service unavailable - don't pollute console with verbose logs
            setCapitalFlow(null)
            if (capitalData.error) {
              console.warn('[MarketContext] 资金流向数据不可用:', capitalData.error)
              setError(capitalData.error)
            }
            if (capitalData.meta) {
              setMarketMeta(capitalData.meta)
            }
          }
        }
      } else {
        console.error('[MarketContext] capital-flow 请求失败:', capitalRes.status)
        setCapitalFlow(null)
      }

      // Process sector flow data (log only, no state update needed)
      if (sectorRes.ok) {
        const sectorData = await sectorRes.json()
        if (process.env.NODE_ENV === 'development') {
          console.log('[MarketContext] 板块资金流向已更新:', sectorData.success ? '成功' : '失败')
        }
      } else {
        console.error('[MarketContext] sectors 请求失败:', sectorRes.status)
      }

      setLastUpdate(new Date())
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err)
      console.warn('[MarketContext] 数据获取失败:', errorMessage)

      // Silent fail on timeout - don't show error to user
      // Market data is not critical for all pages
      if (errorMessage.includes('aborted') || errorMessage.includes('timeout')) {
        console.warn('[MarketContext] 请求超时，将在下次刷新时重试')
        // Don't set error - fail silently
      } else {
        console.error('[MarketContext] 网络请求失败:', errorMessage)
        setError('网络请求失败，请确认数据服务已启动')
      }

      // Keep existing data on error - don't clear everything
      // setIndices([])
      // setCapitalFlow(null)
    } finally {
      setIsLoading(false)
    }
  }, [])

  // Manual refresh function that bypasses cache
  const refetch = useCallback(() => {
    return fetchData(true) // Force refresh bypasses cache
  }, [fetchData])

  // 初始加载
  useEffect(() => {
    // Intentional client-side initialization: hydrate the shared market context on mount.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchData()
  }, [fetchData])

  // 自动刷新定时器
  useEffect(() => {
    // 交易时段每1分钟刷新，非交易时段每5分钟刷新
    const refreshInterval = marketMeta?.isOpen ? 60 * 1000 : 5 * 60 * 1000
    const interval = setInterval(() => {
      fetchData() // Automatic refresh uses cache
    }, refreshInterval)

    if (process.env.NODE_ENV === 'development') {
      console.log(
        `[MarketContext] 刷新间隔: ${marketMeta?.isOpen ? '1分钟' : '5分钟'} (交易状态: ${marketMeta?.isOpen ? '开盘' : '休市'})`
      )
    }

    return () => clearInterval(interval)
  }, [marketMeta?.isOpen, fetchData])

  // Format utilities
  const format = useMemo(() => {
    const sourceDisplay: SourceDisplay = SOURCE_MAP[source] || SOURCE_MAP['loading']

    const timeDisplay = lastUpdate
      ? lastUpdate.toLocaleString('zh-CN', {
          year: 'numeric',
          month: '2-digit',
          day: '2-digit',
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit',
        })
      : ''

    const statusBadge: StatusBadge = marketMeta
      ? {
          icon: marketMeta.isRealtime ? 'live' : 'closed',
          label: marketMeta.isRealtime ? '交易中' : marketMeta.statusText,
          variant: marketMeta.isRealtime ? 'default' : 'outline',
        }
      : { icon: 'loader', label: '获取中...', variant: 'outline' }

    const sentimentDisplay: SentimentDisplay = {
      score: sentiment,
      label:
        sentiment >= SENTIMENT_THRESHOLDS.BULLISH
          ? '偏多'
          : sentiment <= SENTIMENT_THRESHOLDS.BEARISH
            ? '偏空'
            : '中性',
      color:
        sentiment >= SENTIMENT_THRESHOLDS.BULLISH
          ? 'text-red-500'
          : sentiment <= SENTIMENT_THRESHOLDS.BEARISH
            ? 'text-green-500'
            : 'text-gray-500',
    }

    return { sourceDisplay, timeDisplay, statusBadge, sentimentDisplay }
  }, [source, lastUpdate, marketMeta, sentiment])

  const value: MarketContextValue = {
    indices,
    capitalFlow,
    northbound,
    sentiment,
    marketMeta,
    isLoading,
    error,
    source,
    lastUpdate,
    refetch,
    format,
  }

  return <MarketContext.Provider value={value}>{children}</MarketContext.Provider>
}
