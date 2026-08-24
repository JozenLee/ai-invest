import { NextRequest, NextResponse } from 'next/server'

const DATA_SERVICE_URL = process.env.DATA_SERVICE_URL || 'http://localhost:8000'
export const maxDuration = 420

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ industry_id: string }> }
) {
  try {
    const { industry_id } = await params
    const searchParams = request.nextUrl.searchParams
    const periodDays = searchParams.get('period_days') || '90'
    const source = searchParams.get('source') || 'graph'
    const etfCodes = searchParams.get('etf_codes') || ''

    const response = await fetch(
      `${DATA_SERVICE_URL}/api/industry-analysis/${industry_id}/companies?period_days=${periodDays}&source=${encodeURIComponent(source)}&etf_codes=${encodeURIComponent(etfCodes)}`,
      {
        headers: {
          'Content-Type': 'application/json',
        },
        // 企业数据抓取与 AI 趋势报告生成是串联阶段，必须覆盖完整 AI 等待预算。
        signal: AbortSignal.timeout(420000),
      }
    )

    if (!response.ok) {
      const error = await response.json().catch(() => ({}))
      return NextResponse.json(
        {
          success: false,
          stage: error.stage,
          error_code: error.error_code,
          error: error.error || error.detail || '企业趋势分析失败',
          details: error.details,
        },
        { status: response.status }
      )
    }

    const data = await response.json()
    return NextResponse.json(data)
  } catch (error) {
    console.error('Industry company analysis error:', error)
    return NextResponse.json(
      {
        success: false,
        stage: error instanceof Error && error.name === 'TimeoutError' ? 'company_data' : 'service',
        error_code: error instanceof Error && error.name === 'TimeoutError' ? 'ANALYSIS_TIMEOUT' : 'ANALYSIS_SERVICE_UNAVAILABLE',
        error: error instanceof Error && error.name === 'TimeoutError'
          ? '企业数据分析超时，请稍后重试'
          : '企业数据分析服务暂时不可用，请稍后重试',
      },
      { status: 500 }
    )
  }
}
