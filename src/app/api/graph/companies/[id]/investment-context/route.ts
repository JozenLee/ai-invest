import { NextRequest, NextResponse } from 'next/server'

const DATA_SERVICE_URL = process.env.DATA_SERVICE_URL || 'http://localhost:8000'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const industryId = request.nextUrl.searchParams.get('industryId') || ''
    const query = industryId ? `?industry_id=${encodeURIComponent(industryId)}` : ''
    const response = await fetch(
      `${DATA_SERVICE_URL}/api/v1/companies/${encodeURIComponent(id)}/investment-context${query}`,
      { cache: 'no-store', signal: AbortSignal.timeout(15000) }
    )
    const payload = await response.json().catch(() => null)
    if (!response.ok) {
      return NextResponse.json(
        { success: false, error: payload?.detail || '获取企业投资映射失败' },
        { status: response.status }
      )
    }
    return NextResponse.json({ success: true, data: payload })
  } catch (error) {
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : '获取企业投资映射失败' },
      { status: 500 }
    )
  }
}
