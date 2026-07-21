'use client'

import { useState, useEffect, useCallback } from 'react'

interface UserPreferences {
  id?: string
  showEstimatedData: boolean
  showDataQualityBadge: boolean
  autoRefreshInterval: number
}

export function usePreferences() {
  const [preferences, setPreferences] = useState<UserPreferences>({
    showEstimatedData: true,
    showDataQualityBadge: true,
    autoRefreshInterval: 300000,
  })
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchPreferences = useCallback(async () => {
    try {
      setIsLoading(true)
      const response = await fetch('/api/settings/preferences')
      const data = await response.json()
      setPreferences(data)
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch preferences')
    } finally {
      setIsLoading(false)
    }
  }, [])

  const updatePreferences = useCallback(async (updates: Partial<UserPreferences>) => {
    try {
      const response = await fetch('/api/settings/preferences', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...preferences, ...updates }),
      })
      const data = await response.json()
      setPreferences(data)
      return data
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update preferences')
      throw err
    }
  }, [preferences])

  useEffect(() => {
    fetchPreferences()
  }, [fetchPreferences])

  return {
    preferences,
    isLoading,
    error,
    updatePreferences,
    refetch: fetchPreferences,
  }
}

export type { UserPreferences }
