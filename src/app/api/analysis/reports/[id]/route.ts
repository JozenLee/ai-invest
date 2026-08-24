import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { normalizeComprehensiveReportContent } from '@/lib/analysis/report-content'
import { buildRuleBasedAdvice } from '@/lib/analysis/daily-action'
import { normalizeCompany, normalizeMarket, normalizeNews, normalizePortfolio } from '@/lib/analysis/report-contract'

function parseData(value: string | null) {
  if (!value) return null

  try {
    return JSON.parse(value)
  } catch {
    return null
  }
}

function hydrateMissingRecommendations(data: unknown, industryName: string) {
  if (!data || typeof data !== 'object' || Array.isArray(data)) return data
  const reportData = data as Record<string, unknown>
  const advice = reportData.advice && typeof reportData.advice === 'object' && !Array.isArray(reportData.advice)
    ? reportData.advice as Record<string, unknown>
    : null
  if (!advice || (Array.isArray(advice.recommendations) && advice.recommendations.length > 0)) return data

  const snapshot = reportData.snapshot && typeof reportData.snapshot === 'object' ? reportData.snapshot as Record<string, unknown> : {}
  const preferences = snapshot.preferences && typeof snapshot.preferences === 'object' ? snapshot.preferences as Record<string, unknown> : {}
  const quality = reportData.quality
  if (!quality || typeof quality !== 'object' || Array.isArray(quality)) return data

  const fallback = buildRuleBasedAdvice(
    industryName,
    normalizeMarket(reportData.market),
    normalizeNews(reportData.news),
    normalizeCompany(reportData.company),
    normalizePortfolio(reportData.portfolio),
    quality as Parameters<typeof buildRuleBasedAdvice>[5],
    String(preferences.riskTolerance || 'balanced'),
    String(preferences.investmentHorizon || 'medium'),
  )
  return { ...reportData, advice: { ...advice, recommendations: fallback.recommendations } }
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params
    const report = await prisma.aIAnalysisReport.findUnique({ where: { id } })

    if (!report) {
      return NextResponse.json({ success: false, error: '报告不存在' }, { status: 404 })
    }

    const data = report.type === 'comprehensive'
      ? hydrateMissingRecommendations(parseData(report.dataJson), report.industryName)
      : parseData(report.dataJson)
    return NextResponse.json({
      success: true,
      report: {
        ...report,
        content: report.type === 'comprehensive' ? normalizeComprehensiveReportContent(report.content, data) : report.content,
        data,
        createdAt: report.createdAt.toISOString(),
      },
    })
  } catch (error) {
    console.error('Read analysis report error:', error)
    return NextResponse.json(
      { success: false, error: '读取分析报告失败' },
      { status: 500 },
    )
  }
}
