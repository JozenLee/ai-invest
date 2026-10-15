import { applyExecutionQuality } from '@/lib/analysis/report-quality'
import { financialFacts } from '@/lib/analysis/financial-facts'
import { adjustedBars } from '@/lib/research/engine'
import type { ETFInput } from '@/lib/research/contracts'
import { reportIntegrityWarnings } from '@/lib/analysis/decision-audit'
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
        const timing=effectiveDecisionTiming(data.decisionTiming,new Date().toISOString(),{asOf:data.researchEvaluation?.asOf||report.createdAt.toISOString(),closeDataSession:data.researchEvaluation?.expectedSession||null})
        // Derive audit counts only from this report's immutable snapshot. Never use today's data.
        if(data.researchEvaluation?.snapshotId && data.researchEvaluation.decisions?.some((item:{adjustmentAudit?:unknown})=>!item.adjustmentAudit)){
          const frozen=await prisma.rawPayload.findUnique({where:{id:data.researchEvaluation.snapshotId}})
          if(frozen?.datasetKey==='research_snapshot'){
            const snapshot=JSON.parse(frozen.payload)
            if(snapshot.id===data.researchEvaluation.snapshotId&&snapshot.profile?.industryId===report.industryId){
              data.researchEvaluation.decisions=data.researchEvaluation.decisions.map((item:{ticker:string;adjustmentAudit?:unknown})=>{
                const etf=snapshot.etfs?.find((row:ETFInput)=>row.ticker===item.ticker)
                return !item.adjustmentAudit&&etf?{...item,adjustmentAudit:adjustedBars(etf,data.researchEvaluation.expectedSession).adjustmentAudit}:item
              })
            }
          }
        }
        if(!data.canonicalFinancialFacts&&data.researchEvaluation?.snapshotId){
          const frozen=await prisma.rawPayload.findUnique({where:{id:data.researchEvaluation.snapshotId}})
          if(frozen?.datasetKey==='research_snapshot'){
            const snapshot=JSON.parse(frozen.payload)
            if(snapshot.id===data.researchEvaluation.snapshotId&&snapshot.profile?.industryId===report.industryId)data.canonicalFinancialFacts=financialFacts(snapshot.projections?.['fetch-company-data']?.['company-market-data'])
          }
        }
        data.integrityWarnings=reportIntegrityWarnings(data)
        if(data.integrityWarnings.length){timing.executionReady=false;timing.status='reference-only';timing.label='仅供投资参考';timing.reasons=[...new Set([...timing.reasons,'归档报告数值校验未通过，需重新生成'])]}
        data.decisionTiming=timing
        if(data.reportQuality)data.reportQuality=applyExecutionQuality(data.reportQuality,data.investmentAdvice,data.portfolioDecisionSupport,timing)
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
        if(data.socialReport){try{data.socialReport=normalizeSocialReport(parseSocialReport(JSON.stringify(data.socialReport)),data.researchEvaluation,data.companyAnalysis)}catch{/* Invalid legacy summary must not discard timing and integrity gates. */}}
        return NextResponse.json({...report,summary:normalizeReportTimingText(report.summary,timing),content:normalizeReportTimingText(report.content,timing),dataJson:JSON.stringify(data)})
      }catch{/* Preserve legacy unreadable data for diagnostics. */}
    }
    return NextResponse.json(report)
  } catch (error) {
    console.error('Failed to get report:', error)
    return NextResponse.json({ error: String(error) }, { status: 500 })
  }
}
