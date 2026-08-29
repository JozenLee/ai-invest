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
    const marketIndexCodes = searchParams.get('market_index_codes') || ''

    if (!industryName) {
      return NextResponse.json(
        { success: false, error: 'industry_name is required' },
        { status: 400 }
      )
    }

    const response = await fetch(
      `${DATA_SERVICE_URL}/api/industry-analysis/${industry_id}/market?industry_name=${encodeURIComponent(industryName)}&period_days=${periodDays}&market_index_codes=${encodeURIComponent(marketIndexCodes)}`,
      {
        headers: {
          'Content-Type': 'application/json',
        },
        signal: AbortSignal.timeout(600000),
      }
    )

    const payload = await readPayload(response)

    if (!response.ok) {
      return NextResponse.json(
        {
          success: false,
          error: payload.detail || payload.error || payload.error_detail || 'Analysis failed',
          error_detail: payload.error_detail,
          data_quality: payload.data_quality,
        },
        { status: response.status }
      )
    }

    return NextResponse.json(payload)
  } catch (error) {
    console.error('Industry market analysis error:', error)
    const isTimeout = error instanceof Error && (error.name === 'TimeoutError' || error.name === 'AbortError')
    return NextResponse.json(
      {
        success: false,
        error: isTimeout
          ? '大盘分析耗时较长，数据服务在600秒内未返回。请稍后重试。'
          : error instanceof Error ? error.message : '大盘分析服务暂时不可用',
      },
      { status: isTimeout ? 504 : 502 }
    )
  }
}
