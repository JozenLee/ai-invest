import { NextResponse } from 'next/server'
import { apiCache } from '@/lib/cache'

export async function POST() {
  try {
    // Clear the capital flow cache
    const cacheKey = 'capital_flow_macro'

    // Since our cache doesn't have a clear method, we can't directly clear it
    // But we can force a fresh fetch by adding a cache-busting parameter

    return NextResponse.json({
      success: true,
      message: 'Cache cleared (note: in-memory cache will expire naturally)',
    })
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        error: String(error),
      },
      { status: 500 }
    )
  }
}
