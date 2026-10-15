import { applyExecutionQuality } from '@/lib/analysis/report-quality'
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { normalizeComprehensiveReportContent } from '@/lib/analysis/report-content'
import { normalizeSocialReport, parseSocialReport } from '@/lib/analysis/social-report'
import { reportAdviceConfidence } from '@/lib/analysis/report-insights'
import { annotateHistoricalReports, isVerificationReport, selectHistoricalReports } from '@/lib/research/history-reports'
import { getResearchProfile } from '@/lib/research/store'
import { sessionBoundary } from '@/lib/research/time'
import { effectiveDecisionTiming, normalizeReportTimingText } from '@/lib/analysis/decision-timing'

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
  const timing=data?.decisionTiming?effectiveDecisionTiming(data.decisionTiming,new Date().toISOString(),{asOf:data.researchEvaluation?.asOf||report.createdAt.toISOString(),closeDataSession:data.researchEvaluation?.expectedSession||null}):null
  if(timing)data.decisionTiming=timing
  if(data?.reportQuality)data.reportQuality=applyExecutionQuality(data.reportQuality,data.investmentAdvice,data.portfolioDecisionSupport,timing)
  if(['comprehensive','verification'].includes(report.type)&&data?.socialReport){
    try{data.socialReport=normalizeSocialReport(parseSocialReport(JSON.stringify(data.socialReport)),data.researchEvaluation,data.companyAnalysis)}catch{/* Keep the stored payload inspectable. */}
  }
  return {
    id: report.id,
    type: report.type,
    industryId: report.industryId,
    industryName: report.industryName,
    title: report.title,
    summary: timing?normalizeReportTimingText(report.summary,timing):report.summary,
    content: ['comprehensive','verification'].includes(report.type) ? normalizeComprehensiveReportContent(timing?normalizeReportTimingText(report.content,timing)||report.content:report.content, data) : report.content,
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
    const hideVerification = type === 'comprehensive' && searchParams.get('includeVerification') !== 'true'
    const visibleReports = <T extends { dataJson: string | null }>(reports: T[]) => (hideVerification ? reports.filter(report => !isVerificationReport(report)) : reports).slice(0, limit)

    if(searchParams.get('view')==='summary'){
      const contextIndustryId=searchParams.get('contextIndustryId')||undefined
      const listIndustryId=searchParams.get('scope')==='all'?undefined:industryId
      const candidates=await prisma.aIAnalysisReport.findMany({where:{...(listIndustryId?{industryId:listIndustryId}:{}),...(type?{type}:{})},orderBy:{createdAt:'desc'},take:hideVerification?MAX_REPORTS:limit,select:{id:true,type:true,industryId:true,industryName:true,title:true,summary:true,dataJson:true,createdAt:true}})
      const reports=visibleReports(candidates)
      let includedIds=new Set<string>(),annotations=reports.map(()=>({sessionDate:null as string|null,includedInNextAnalysis:false,inclusionLabel:'不在当前回溯窗口'})),contextPolicy=null
      if(contextIndustryId){
        const [profile,calendarRow]=await Promise.all([getResearchProfile(contextIndustryId),prisma.rawPayload.findFirst({where:{datasetKey:'research_calendar'},orderBy:{fetchedAt:'desc'},select:{payload:true}})])
        const payload=parseData(calendarRow?.payload||null),rows=Array.isArray(payload)?payload:Array.isArray(payload?.data)?payload.data:[]
        const calendar=rows.map((row:Record<string,unknown>)=>({date:String(row.cal_date||row.date||''),open:Number(row.is_open??row.open)===1})).filter((row:{date:string})=>/^\d{4}-?\d{2}-?\d{2}$/.test(row.date)).map((row:{date:string;open:boolean})=>({...row,date:row.date.replace(/^(\d{4})(\d{2})(\d{2})$/,'$1-$2-$3')}))
        const asOf=new Date().toISOString(),boundary=sessionBoundary(calendar,asOf)
        const included=selectHistoricalReports({candidates:reports,profile,tradingSessions:calendar.filter((day:{open:boolean})=>day.open).map((day:{date:string})=>day.date),cutoff:boundary.expectedSession,asOf})
        includedIds=new Set(included.map(item=>item.reportId));annotations=annotateHistoricalReports(reports,included,contextIndustryId);contextPolicy=profile.historyReports||{enabled:true,lookbackTradingDays:10,mode:'latest-per-trading-day'}
      }
      return NextResponse.json({success:true,contextPolicy,reports:reports.map((report,index)=>{
        const data=parseData(report.dataJson),decisions=Array.isArray(data?.researchEvaluation?.decisions)?data.researchEvaluation.decisions:[]
        const stateCounts:Record<string,number>=decisions.reduce((counts:Record<string,number>,item:{state?:string})=>{const key=item.state||'unknown';counts[key]=(counts[key]||0)+1;return counts},{})
        const advice=typeof data?.investmentAdvice==='string'?parseData(data.investmentAdvice):data?.investmentAdvice
        const productDecisions=Array.isArray(advice?.productDecisions)?advice.productDecisions:[]
        stateCounts['ai-increase']=productDecisions.filter((item:{unheldAction?:string;heldAction?:string})=>item.unheldAction==='建仓'||item.heldAction==='加仓').length
        stateCounts['ai-reduce']=productDecisions.filter((item:{heldAction?:string})=>item.heldAction==='减仓').length
        const timing=data?.decisionTiming?effectiveDecisionTiming(data.decisionTiming,new Date().toISOString(),{asOf:data.researchEvaluation?.asOf||report.createdAt.toISOString(),closeDataSession:data.researchEvaluation?.expectedSession||null}):null
        return {id:report.id,type:report.type,industryId:report.industryId,industryName:report.industryName,title:report.title,summary:timing?normalizeReportTimingText(report.summary,timing):report.summary,createdAt:report.createdAt.toISOString(),metadata:data?.metadata||null,quality:data?.reportQuality?applyExecutionQuality(data.reportQuality,data.investmentAdvice,data.portfolioDecisionSupport,timing):null,recommendation:{confidencePct:reportAdviceConfidence(data?.researchEvaluation,data?.dataQuality),stateCounts,decisionSource:productDecisions.length?'ai':'legacy-rule'},...annotations[index],includedInNextAnalysis:includedIds.has(report.id)}
      })})
    }

    const candidates = await prisma.aIAnalysisReport.findMany({
      where: {
        ...(industryId ? { industryId } : {}),
        ...(type ? { type } : {}),
      },
      orderBy: { createdAt: 'desc' },
      take: hideVerification ? MAX_REPORTS : limit,
    })
    const reports = visibleReports(candidates)

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
