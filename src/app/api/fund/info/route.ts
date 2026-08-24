import { NextRequest } from 'next/server'
import { proxyToDataService } from '@/lib/api/proxy'

export async function GET(request: NextRequest) {
  const ticker = request.nextUrl.searchParams.get('ticker')
  if (!ticker) {
    return Response.json({ success: false, error: '缺少参数: ticker', data: null }, { status: 400 })
  }

  return proxyToDataService({ path: `/api/fund/${encodeURIComponent(ticker)}/info`, timeout: 15000 })
}
