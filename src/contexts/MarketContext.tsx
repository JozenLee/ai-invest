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

  const fetchData = useCallback(async () => {
    setIsLoading(true)
    setError(null)

    try {
      const clientTimeout = AbortSignal.timeout(30000)

      // Parallel requests for index data and capital flow data
      const [overviewRes, capitalRes] = await Promise.all([
        fetch('/api/market/overview', { signal: clientTimeout }),
        fetch('/api/market/capital-flow', { signal: clientTimeout }),
      ])

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
        setIndices([])
      }

      // Process capital flow data
      if (capitalRes.ok) {
        const capitalData = await capitalRes.json()
        if (capitalData.success && capitalData.data) {
          setCapitalFlow(capitalData.data)

          // Extract northbound data (unified structure)
          if (capitalData.data.northbound) {
            setNorthbound(capitalData.data.northbound)
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
          setCapitalFlow(null)
          if (capitalData.error) {
            setError(capitalData.error)
          }
          if (capitalData.meta) {
            setMarketMeta(capitalData.meta)
          }
        }
      } else {
        setCapitalFlow(null)
      }

      setLastUpdate(new Date())
    } catch (err) {
      console.error('Failed to fetch market data:', err)
      setError('Network request failed. Please check if the data service is running.')
      setIndices([])
      setCapitalFlow(null)
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchData()

    // Refresh every 30s during trading hours, every 5 minutes otherwise
    const refreshInterval = marketMeta?.isOpen ? 30 * 1000 : 5 * 60 * 1000
    const interval = setInterval(fetchData, refreshInterval)

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
          icon: marketMeta.isRealtime ? '🟢' : '⚪',
          label: marketMeta.isRealtime ? '交易中' : marketMeta.statusText,
          variant: marketMeta.isRealtime ? 'default' : 'outline',
        }
      : { icon: '⏳', label: '获取中...', variant: 'outline' }

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
    refetch: fetchData,
    format,
  }

  return <MarketContext.Provider value={value}>{children}</MarketContext.Provider>
}
