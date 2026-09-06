import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { normalizeSocialReport, parseSocialReport } from '@/lib/analysis/social-report'

/**
 * GET /api/analysis/reports/[id]
 * 获取分析报告详情
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params

    const report = await prisma.aIAnalysisReport.findUnique({
      where: { id }
    })

    if (!report) {
      return NextResponse.json({ error: 'Report not found' }, { status: 404 })
    }

    if(report.type==='comprehensive'&&report.dataJson){
      try{
        const data=JSON.parse(report.dataJson)
        if(data.socialReport)data.socialReport=normalizeSocialReport(parseSocialReport(JSON.stringify(data.socialReport)),data.researchEvaluation,data.companyAnalysis)
        return NextResponse.json({...report,dataJson:JSON.stringify(data)})
      }catch{/* Preserve legacy unreadable data for diagnostics. */}
    }
    return NextResponse.json(report)
  } catch (error) {
    console.error('Failed to get report:', error)
    return NextResponse.json({ error: String(error) }, { status: 500 })
  }
}
