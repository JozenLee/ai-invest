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
  const reconnectTimeoutRef = useRef<NodeJS.Timeout>()

  const connect = useCallback(() => {
    try {
      // 创建EventSource连接
      const eventSource = new EventSource('/api/events/stream')
      eventSourceRef.current = eventSource

      eventSource.onopen = () => {
        console.log('[useNewsStream] SSE connected')
        setIsConnected(true)
        setError(null)
      }

      eventSource.addEventListener('connected', (event) => {
        const data = JSON.parse(event.data)
        console.log('[useNewsStream] Connection established:', data)
      })

      eventSource.addEventListener('news_updated', (event) => {
        const data = JSON.parse(event.data)
        console.log('[useNewsStream] News updated:', data)
        setLastEvent(data)
        onUpdate?.(data)
      })

      eventSource.addEventListener('batch_completed', (event) => {
        const data = JSON.parse(event.data)
        console.log('[useNewsStream] Batch completed:', data)
        setLastEvent(data)
        onUpdate?.(data)
      })

      eventSource.addEventListener('heartbeat', (event) => {
        const data = JSON.parse(event.data)
        console.log('[useNewsStream] Heartbeat:', data)
      })

      eventSource.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data)
          setLastEvent(data)
          onUpdate?.(data)
        } catch (err) {
          console.error('[useNewsStream] Failed to parse message:', err)
        }
      }

      eventSource.onerror = (err) => {
        console.error('[useNewsStream] SSE error:', err)
        setIsConnected(false)
        setError('连接断开')
        eventSource.close()

        // 自动重连
        if (autoReconnect) {
          console.log(`[useNewsStream] Reconnecting in ${reconnectDelay}ms...`)
          reconnectTimeoutRef.current = setTimeout(connect, reconnectDelay)
        }
      }
    } catch (err) {
      console.error('[useNewsStream] Failed to connect:', err)
      setError('连接失败')
    }
  }, [onUpdate, autoReconnect, reconnectDelay])

  const disconnect = useCallback(() => {
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current)
    }
    if (eventSourceRef.current) {
      eventSourceRef.current.close()
      eventSourceRef.current = null
    }
    setIsConnected(false)
  }, [])

  useEffect(() => {
    connect()

    return () => {
      disconnect()
    }
  }, [connect, disconnect])

  return {
    isConnected,
    lastEvent,
    error,
    reconnect: connect,
    disconnect,
  }
}
