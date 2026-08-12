import { NextRequest, NextResponse } from 'next/server'

const DATA_SERVICE_URL = process.env.DATA_SERVICE_URL || 'http://localhost:8000'

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

    if (!response.ok) {
      const error = await response.json()
      return NextResponse.json(
        { success: false, error: error.detail || 'Failed to fetch news' },
        { status: response.status }
      )
    }

    const data = await response.json()
    return NextResponse.json(data)
  } catch (error) {
    console.error('Industry news analysis error:', error)
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    )
  }
}
