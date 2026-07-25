import { NextResponse } from 'next/server'
import { apiCache } from '@/lib/cache'

export async function POST() {
  try {
    // Clear all in-memory cache entries
    apiCache.clear()

    return NextResponse.json({
      success: true,
      message: 'All cache entries cleared successfully',
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
