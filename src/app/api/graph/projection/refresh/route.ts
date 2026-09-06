import { NextResponse } from 'next/server'
import { syncGraphEtfSubscriptions } from '@/lib/data-subscription-overview'

/** Refresh the Neo4j -> SQLite research projection without scheduling market fetches. */
export async function POST() {
  try {
    const result = await syncGraphEtfSubscriptions()
    return NextResponse.json({ success: true, data: { industries: result.groups.length, etfs: result.etfCount } })
  } catch (error) {
    return NextResponse.json({ success: false, error: error instanceof Error ? error.message : '刷新图谱投影失败' }, { status: 500 })
  }
}
