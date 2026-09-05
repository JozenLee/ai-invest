'use client'
import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from 'react'
import type { MarketContextValue, IndexData, CapitalFlowData, MarketMeta } from '@/types/market'
import { SOURCE_MAP } from '@/types/market'
const MarketContext = createContext<MarketContextValue | null>(null)
export function useMarketContext() {
  const context = useContext(MarketContext)
  if (!context) throw new Error('useMarketContext must be used within MarketProvider')
  return context
}
export function MarketProvider({ children }: { children: ReactNode }) {
  const [indices, setIndices] = useState<IndexData[]>([])
  const [capitalFlow, setCapitalFlow] = useState<CapitalFlowData | null>(null)
  const [marketMeta, setMeta] = useState<MarketMeta | null>(null)
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null)
  const [isLoading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const refetch = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const responses = await Promise.all(['/api/market/overview', '/api/market/capital-flow'].map((url) => fetch(url, { cache: 'no-store' })))
      if (responses.some((response) => !response.ok)) throw new Error('订阅数据库读取失败')
      const [overview, flow] = await Promise.all(responses.map((response) => response.json()))
      setIndices(overview.data?.indices || [])
      setMeta(overview.data?.meta || null)
      setCapitalFlow(flow.data || null)
      setLastUpdate(overview.data?.timestamp ? new Date(overview.data.timestamp) : null)
      if (!overview.success || !flow.success) setError([overview.error, flow.error].filter(Boolean).join('；'))
    } catch (reason) { setError(reason instanceof Error ? reason.message : '数据库读取失败') }
    finally { setLoading(false) }
  }, [])
  useEffect(() => {
    void refetch()
    const timer = setInterval(() => { if (!document.hidden) void refetch() }, 30000)
    const onVisible = () => { if (!document.hidden) void refetch() }
    document.addEventListener('visibilitychange', onVisible)
    return () => { clearInterval(timer); document.removeEventListener('visibilitychange', onVisible) }
  }, [refetch])
  return <MarketContext.Provider value={{
    indices, capitalFlow, northbound: capitalFlow?.northbound || null, sentiment: 50,
    marketMeta, isLoading, error, source: 'subscription-database', lastUpdate, refetch,
    format: {
      sourceDisplay: SOURCE_MAP['subscription-database'],
      timeDisplay: lastUpdate?.toLocaleString('zh-CN') || '',
      statusBadge: { icon: 'closed', label: '订阅数据库快照', variant: 'outline' },
      sentimentDisplay: { score: 50, label: '未提供情绪数据', color: 'text-muted-foreground' },
    },
  }}>{children}</MarketContext.Provider>
}
