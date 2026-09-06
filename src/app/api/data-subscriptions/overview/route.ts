import { NextRequest, NextResponse } from 'next/server'
import { getSubscriptionOverview } from '@/lib/data-subscription-overview'

export async function GET(request: NextRequest) {
  try {
    const data = await getSubscriptionOverview(request.nextUrl.searchParams.get('sync') !== 'false')
    return NextResponse.json({ success: true, data })
  } catch (error) {
    return NextResponse.json({ success: false, error: error instanceof Error ? error.message : '获取订阅概览失败' }, { status: 500 })
  }
}
