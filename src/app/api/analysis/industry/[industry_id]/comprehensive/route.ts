import { NextRequest, NextResponse } from 'next/server'

const DATA_SERVICE_URL = process.env.DATA_SERVICE_URL || 'http://localhost:8000'
export const maxDuration = 600

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
    const periodDays = searchParams.get('period_days') || '90'

    if (!industryName) {
      return NextResponse.json(
        { success: false, error: 'industry_name is required' },
        { status: 400 }
      )
    }

    const response = await fetch(
      `${DATA_SERVICE_URL}/api/industry-analysis/${industry_id}/comprehensive?industry_name=${encodeURIComponent(industryName)}&period_days=${periodDays}`,
      {
        headers: {
          'Content-Type': 'application/json',
        },
        signal: AbortSignal.timeout(600000),
      }
    )

    const payload = await readPayload(response)
    const detail = payload.detail as Record<string, unknown> | undefined

    if (!response.ok) {
      return NextResponse.json(
        {
          success: false,
          error: typeof payload.detail === 'string'
            ? payload.detail
            : payload.error || detail?.message || 'Analysis failed',
          error_detail: payload.detail,
        },
        { status: response.status }
      )
    }

    return NextResponse.json(payload)
  } catch (error) {
    console.error('Comprehensive analysis error:', error)
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : '综合分析服务暂时不可用' },
      { status: 502 }
    )
  }
}
