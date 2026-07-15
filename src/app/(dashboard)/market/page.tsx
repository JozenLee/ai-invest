'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'

export default function MarketPage() {
  const router = useRouter()

  useEffect(() => {
    router.replace('/market/overview')
  }, [router])

  return null
}
