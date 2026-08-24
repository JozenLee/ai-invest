import { NextRequest, NextResponse } from 'next/server'

const DATA_SERVICE_URL = process.env.DATA_SERVICE_URL || 'http://localhost:8000'

async function readPayload(response: Response) {
  const text = await response.text()
  if (!text) return {}

  try {
    return JSON.parse(text) as Record<string, unknown>
  } catch {
    return { error: text }
  }
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ industry_id: string }> }
) {
  try {
    const { industry_id } = await params
    const searchParams = request.nextUrl.searchParams
    const industryName = searchParams.get('industry_name')
    const limit = searchParams.get('limit') || '10'

    if (!industryName) {
      return NextResponse.json(
        { success: false, error: 'industry_name is required' },
        { status: 400 }
      )
    }

    const response = await fetch(
      `${DATA_SERVICE_URL}/api/industry-analysis/${industry_id}/news?industry_name=${encodeURIComponent(industryName)}&limit=${limit}`,
      {
        headers: {
          'Content-Type': 'application/json',
        },
      }
    )

    const payload = await readPayload(response)

    if (!response.ok) {
      return NextResponse.json(
        { success: false, error: payload.detail || payload.error || 'Failed to fetch news' },
        { status: response.status }
      )
    }

    return NextResponse.json(payload)
  } catch (error) {
    console.error('Industry news analysis error:', error)
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : '资讯服务暂时不可用' },
      { status: 502 }
    )
  }
}
