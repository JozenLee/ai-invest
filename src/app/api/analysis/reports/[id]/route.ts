import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { normalizeSocialReport, parseSocialReport } from '@/lib/analysis/social-report'
import { effectiveDecisionTiming, normalizeReportTimingText } from '@/lib/analysis/decision-timing'

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

    if(['comprehensive','verification'].includes(report.type)&&report.dataJson){
      try{
        const data=JSON.parse(report.dataJson)
        const timing=effectiveDecisionTiming(data.decisionTiming,report.createdAt.toISOString(),{asOf:data.researchEvaluation?.asOf||report.createdAt.toISOString(),closeDataSession:data.researchEvaluation?.expectedSession||null})
        data.decisionTiming=timing
        // Enrich an old report only from its own immutable snapshot. Never read
        // today's NAV or silently replace the stored historical evaluation.
        const snapshotId=data.researchEvaluation?.snapshotId
        if(snapshotId&&data.researchEvaluation?.products?.some((item:{nav?:number|null})=>item.nav===undefined)){
          const row=await prisma.rawPayload.findUnique({where:{id:snapshotId}})
          if(row?.datasetKey==='research_snapshot'){
            const snapshot=JSON.parse(row.payload)
            if(snapshot.id===snapshotId&&snapshot.profile?.industryId===report.industryId){
              data.researchEvaluation.products=data.researchEvaluation.products.map((item:{ticker:string;navDate?:string;nav?:number|null})=>{
                const frozen=snapshot.etfs?.find((etf:{ticker:string})=>etf.ticker===item.ticker)?.product
                return frozen&&frozen.date===item.navDate?{...item,nav:frozen.nav,navSource:frozen.navSource}:item
              })
            }
          }
        }
        if(data.socialReport)data.socialReport=normalizeSocialReport(parseSocialReport(JSON.stringify(data.socialReport)),data.researchEvaluation,data.companyAnalysis)
        return NextResponse.json({...report,summary:normalizeReportTimingText(report.summary,timing),content:normalizeReportTimingText(report.content,timing),dataJson:JSON.stringify(data)})
      }catch{/* Preserve legacy unreadable data for diagnostics. */}
    }
    return NextResponse.json(report)
  } catch (error) {
    console.error('Failed to get report:', error)
    return NextResponse.json({ error: String(error) }, { status: 500 })
  }
}
