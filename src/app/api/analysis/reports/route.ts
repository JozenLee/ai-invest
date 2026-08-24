import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { normalizeComprehensiveReportContent } from '@/lib/analysis/report-content'

const MAX_REPORTS = 100

function parseData(value: string | null) {
  if (!value) return null

  try {
    return JSON.parse(value)
  } catch {
    return null
  }
}

function serializeReport(report: {
  id: string
  type: string
  industryId: string
  industryName: string
  title: string
  summary: string | null
  content: string
  dataJson: string | null
  createdAt: Date
}) {
  const data = parseData(report.dataJson)
  return {
    id: report.id,
    type: report.type,
    industryId: report.industryId,
    industryName: report.industryName,
    title: report.title,
    summary: report.summary,
    content: report.type === 'comprehensive' ? normalizeComprehensiveReportContent(report.content, data) : report.content,
    data,
    createdAt: report.createdAt.toISOString(),
  }
}

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams
    const industryId = searchParams.get('industryId') || undefined
    const type = searchParams.get('type') || undefined
    const requestedLimit = Number(searchParams.get('limit') || 20)
    const limit = Number.isFinite(requestedLimit)
      ? Math.min(Math.max(Math.floor(requestedLimit), 1), MAX_REPORTS)
      : 20

    const reports = await prisma.aIAnalysisReport.findMany({
      where: {
        ...(industryId ? { industryId } : {}),
        ...(type ? { type } : {}),
      },
      orderBy: { createdAt: 'desc' },
      take: limit,
    })

    return NextResponse.json({
      success: true,
      reports: reports.map(serializeReport),
    })
  } catch (error) {
    console.error('List analysis reports error:', error)
    return NextResponse.json(
      { success: false, error: '读取分析报告失败' },
      { status: 500 },
    )
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const type = typeof body.type === 'string' ? body.type.trim() : ''
    const industryId = typeof body.industryId === 'string' ? body.industryId.trim() : ''
    const industryName = typeof body.industryName === 'string' ? body.industryName.trim() : ''
    const title = typeof body.title === 'string' ? body.title.trim() : ''
    const content = typeof body.content === 'string' ? body.content.trim() : ''
    const summary = typeof body.summary === 'string' ? body.summary.trim() : null

    if (!type || !industryId || !industryName || !title || !content) {
      return NextResponse.json(
        { success: false, error: '报告类型、产业、标题和报告内容不能为空' },
        { status: 400 },
      )
    }

    const report = await prisma.aIAnalysisReport.create({
      data: {
        type,
        industryId,
        industryName,
        title,
        summary,
        content,
        dataJson: body.data === undefined ? null : JSON.stringify(body.data),
      },
    })

    return NextResponse.json({ success: true, report: serializeReport(report) }, { status: 201 })
  } catch (error) {
    console.error('Create analysis report error:', error)
    return NextResponse.json(
      { success: false, error: '保存分析报告失败' },
      { status: 500 },
    )
  }
}
