'use client'

import { useState, useEffect } from 'react'

interface IndexData {
  code: string
  name: string
  price: number
  change: number
  changePct: number
}

interface SectorFlow {
  sector: string
  netFlow: number      // 净流入（亿）
  changePct: number    // 涨跌幅
}

interface NorthboundData {
  net: number          // 北向资金净流入（亿）
  shConnect: number    // 沪股通净流入（亿）
  szConnect: number    // 深股通净流入（亿）
  stale?: boolean      // 是否为历史数据（非交易时段）
  dataDate?: string    // 数据日期
}

interface CapitalFlowData {
  market: {
    institutionalNet: number   // 机构/主力净流入（亿）
    institutionalPct: number   // 机构占比
    retailNet: number          // 散户净流入（亿）
    retailPct: number          // 散户占比
    totalNet: number           // 大盘总净流入（亿）
    sentiment: number          // 市场情绪 (0-100)
  }
  northbound: NorthboundData   // 北向资金
  topInflowSectors: SectorFlow[]   // Top10资金流入板块
  topOutflowSectors: SectorFlow[]  // Top10资金流出板块
}

interface UseMarketDataResult {
  indices: IndexData[]
  capitalFlow: CapitalFlowData | null
  isLoading: boolean
  error: string | null
  source: string
  lastUpdate: Date | null
  refetch: () => void
}

export function useMarketData(): UseMarketDataResult {
  const [indices, setIndices] = useState<IndexData[]>([])
  const [capitalFlow, setCapitalFlow] = useState<CapitalFlowData | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [source, setSource] = useState<string>('loading')
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null)

  const fetchData = async () => {
    setIsLoading(true)
    setError(null)

    try {
      const [overviewRes, capitalRes] = await Promise.all([
        fetch('/api/market/overview'),
        fetch('/api/market/capital-flow'),
      ])

      // 处理指数数据
      if (overviewRes.ok) {
        const overviewData = await overviewRes.json()
        if (overviewData.success && overviewData.data?.indices) {
          setIndices(overviewData.data.indices)
          setSource(overviewData.source || 'unknown')
        } else {
          setIndices([])
          if (overviewData.error) {
            setError(overviewData.error)
          }
        }
      } else {
        setIndices([])
      }

      // 处理资金流向数据
      if (capitalRes.ok) {
        const capitalData = await capitalRes.json()
        if (capitalData.success && capitalData.data) {
          setCapitalFlow(capitalData.data)
          // 优先使用资金流向的source（更精确）
          if (capitalData.data.source) {
            setSource(capitalData.data.source)
          } else if (capitalData.source) {
            setSource(capitalData.source)
          }
        } else {
          setCapitalFlow(null)
          if (capitalData.error) {
            setError(capitalData.error)
          }
        }
      } else {
        setCapitalFlow(null)
      }

      setLastUpdate(new Date())
    } catch (err) {
      console.error('获取市场数据失败:', err)
      setError('网络请求失败，请检查数据服务是否已启动')
      setIndices([])
      setCapitalFlow(null)
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    fetchData()

    // 每1分钟刷新一次
    const interval = setInterval(fetchData, 60 * 1000)

    return () => clearInterval(interval)
  }, [])

  return {
    indices,
    capitalFlow,
    isLoading,
    error,
    source,
    lastUpdate,
    refetch: fetchData,
  }
}
