'use client'

import { useEffect, useRef, useState, useCallback } from 'react'

interface NewsStreamData {
  type: string
  count?: number
  fetched?: number
  analyzed?: number
  saved?: number
  failed?: number
  timestamp: string
  message?: string
}

interface UseNewsStreamOptions {
  onUpdate?: (data: NewsStreamData) => void
  autoReconnect?: boolean
  reconnectDelay?: number
}

export function useNewsStream(options: UseNewsStreamOptions = {}) {
  const {
    onUpdate,
    autoReconnect = true,
    reconnectDelay = 5000,
  } = options

  const [isConnected, setIsConnected] = useState(false)
  const [lastEvent, setLastEvent] = useState<NewsStreamData | null>(null)
  const [error, setError] = useState<string | null>(null)

  const eventSourceRef = useRef<EventSource | null>(null)
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | undefined>(undefined)
  const reconnectAttemptsRef = useRef<number>(0)
  const maxReconnectAttempts = 3

  // 使用 ref 保存 onUpdate 回调，避免因回调变化导致重连
  const onUpdateRef = useRef(onUpdate)
  useEffect(() => {
    onUpdateRef.current = onUpdate
  }, [onUpdate])

  const disconnect = useCallback(() => {
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current)
      reconnectTimeoutRef.current = undefined
    }
    if (eventSourceRef.current) {
      eventSourceRef.current.close()
      eventSourceRef.current = null
    }
    setIsConnected(false)
  }, [])

  const connect = useCallback(() => {
    // 先清理已有连接
    disconnect()

    try {
      // 创建EventSource连接
      const eventSource = new EventSource('/api/events/stream')
      eventSourceRef.current = eventSource

      eventSource.onopen = () => {
        console.log('[useNewsStream] SSE connected')
        setIsConnected(true)
        setError(null)
        reconnectAttemptsRef.current = 0 // 重置重连计数
      }

      eventSource.addEventListener('connected', (event) => {
        const data = JSON.parse(event.data)
        console.log('[useNewsStream] Connection established:', data)
      })

      eventSource.addEventListener('news_updated', (event) => {
        const data = JSON.parse(event.data)
        console.log('[useNewsStream] News updated:', data)
        setLastEvent(data)
        onUpdateRef.current?.(data)
      })

      eventSource.addEventListener('batch_completed', (event) => {
        const data = JSON.parse(event.data)
        console.log('[useNewsStream] Batch completed:', data)
        setLastEvent(data)
        onUpdateRef.current?.(data)
      })

      eventSource.addEventListener('heartbeat', (event) => {
        const data = JSON.parse(event.data)
        console.log('[useNewsStream] Heartbeat:', data)
      })

      eventSource.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data)
          setLastEvent(data)
          onUpdateRef.current?.(data)
        } catch (err) {
          console.error('[useNewsStream] Failed to parse message:', err)
        }
      }

      eventSource.onerror = (err) => {
        console.error('[useNewsStream] SSE error:', err)
        setIsConnected(false)

        // 关闭当前连接
        if (eventSourceRef.current) {
          eventSourceRef.current.close()
          eventSourceRef.current = null
        }

        // 自动重连（带指数退避和最大重试次数限制）
        if (autoReconnect && reconnectAttemptsRef.current < maxReconnectAttempts) {
          reconnectAttemptsRef.current += 1
          const delay = reconnectDelay * Math.pow(2, reconnectAttemptsRef.current - 1) // 指数退避
          console.log(`[useNewsStream] Reconnecting (attempt ${reconnectAttemptsRef.current}/${maxReconnectAttempts}) in ${delay}ms...`)
          setError(`重连中... (${reconnectAttemptsRef.current}/${maxReconnectAttempts})`)
          reconnectTimeoutRef.current = setTimeout(connect, delay)
        } else {
          setError('连接不可用')
          console.log('[useNewsStream] Max reconnection attempts reached or auto-reconnect disabled')
        }
      }
    } catch (err) {
      console.error('[useNewsStream] Failed to connect:', err)
      setError('连接失败')
    }
  }, [disconnect, autoReconnect, reconnectDelay])

  useEffect(() => {
    connect()

    return () => {
      disconnect()
    }
  }, []) // 空依赖数组，只在挂载时连接，卸载时断开

  return {
    isConnected,
    lastEvent,
    error,
    reconnect: connect,
    disconnect,
  }
}
