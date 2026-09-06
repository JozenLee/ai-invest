import { NextRequest, NextResponse } from 'next/server'

const DATA_SERVICE_URL = process.env.DATA_SERVICE_URL || 'http://localhost:8000'
export const maxDuration = 900

function isTimeoutError(error: unknown) {
  return error instanceof DOMException
    ? error.name === 'TimeoutError' || error.name === 'AbortError'
    : error instanceof Error && (error.name === 'TimeoutError' || error.name === 'AbortError' || /abort|timeout/i.test(error.message))
}

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
    const generateAiReport = searchParams.get('generate_ai_report') || 'true'
    const topCompanies = searchParams.get('top_companies') || '' // 前端筛选的top企业列表

    // 构建查询参数
    const queryParams = new URLSearchParams({
      period_days: periodDays,
      source: source,
      etf_codes: etfCodes,
      generate_ai_report: generateAiReport,
    })

    // 如果提供了top_companies，传递给后端（用于AI报告生成）
    if (topCompanies) {
      queryParams.set('top_companies', topCompanies)
    }

    const response = await fetch(
      `${DATA_SERVICE_URL}/api/industry-analysis/${industry_id}/companies?${queryParams.toString()}`,
      {
        headers: {
          'Content-Type': 'application/json',
        },
        // 企业数据抓取与 AI 趋势报告生成是串联阶段，必须覆盖完整 AI 等待预算。
        signal: AbortSignal.timeout(720000),
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
    const timedOut = isTimeoutError(error)
    return NextResponse.json(
      {
        success: false,
        stage: timedOut ? 'company_data' : 'service',
        error_code: timedOut ? 'ANALYSIS_TIMEOUT' : 'ANALYSIS_SERVICE_UNAVAILABLE',
        error: timedOut
          ? '企业数据分析超时，请稍后重试'
          : '企业数据分析服务暂时不可用，请稍后重试',
      },
      { status: timedOut ? 504 : 502 }
    )
  }
}
