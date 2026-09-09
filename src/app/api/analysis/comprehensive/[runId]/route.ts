import { NextRequest, NextResponse } from 'next/server'
import { comprehensiveAnalysisWorkflow } from '@/lib/workflow/workflows/comprehensive-analysis'

/**
 * GET /api/analysis/comprehensive/[runId]
 * 获取执行详情
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ runId: string }> }
) {
  try {
    const { runId } = await params

    const view=request.nextUrl.searchParams.get('view')
    const requestedStep=view==='step'?request.nextUrl.searchParams.get('stepName')||undefined:undefined
    const run = await comprehensiveAnalysisWorkflow.getRunDetails(runId, view === 'workspace',requestedStep)

    if (!run) {
      return NextResponse.json({ error: 'Run not found' }, { status: 404 })
    }

    const parseJson = (value: string | null) => {
      if (!value) return null
      try { return JSON.parse(value) } catch { return value }
    }

    const summarizeStepArtifact=(key:string,data:unknown,size:number)=>{
      if(view!=='step'||size<500_000||!data||typeof data!=='object')return {data,truncated:false}
      const row=data as Record<string,unknown>
      if(key==='research-snapshot')return {truncated:true,data:{id:row.id,asOf:row.asOf,profile:row.profile,counts:{etfs:Array.isArray(row.etfs)?row.etfs.length:0,companies:Array.isArray(row.companies)?row.companies.length:0,events:Array.isArray(row.events)?row.events.length:0,evidence:Array.isArray(row.evidence)?row.evidence.length:0,sectorFlows:Array.isArray(row.sectorFlows)?row.sectorFlows.length:0},graphCoverage:(row.graphContext as Record<string,unknown>|undefined)?.coverage,projectionSteps:row.projections&&typeof row.projections==='object'?Object.keys(row.projections):[],rawRecords:'已单独持久化，未在步骤页面重复传输'}}
      if(key==='research-manifest'){
        const evidence=Array.isArray(row.evidence)?row.evidence as Array<Record<string,unknown>>:[]
        const sources=[...evidence.reduce((map,item)=>map.set(String(item.source||'未知'),(map.get(String(item.source||'未知'))||0)+1),new Map<string,number>())].sort((a,b)=>b[1]-a[1]).slice(0,20).map(([source,count])=>({source,count}))
        return {truncated:true,data:{id:row.id,asOf:row.asOf,version:row.version,evidenceCount:evidence.length,sourceSummary:sources,graphRevision:row.graphRevision}}
      }
      if(key==='research-evaluation')return {truncated:true,data:{snapshotId:row.snapshotId,asOf:row.asOf,expectedSession:row.expectedSession,validation:row.validation,indexBreadth:row.indexBreadth,modules:row.modules,decisions:row.decisions,products:row.products,indexOverlaps:row.indexOverlaps,changes:row.changes,omittedConditions:row.omittedConditions,evidenceTotal:Array.isArray(row.evidence)?row.evidence.length:0,eventsTotal:Array.isArray(row.events)?row.events.length:0}}
      if(Array.isArray(data))return {truncated:true,data:data.slice(0,100).map(item=>item&&typeof item==='object'?Object.fromEntries(Object.entries(item as Record<string,unknown>).filter(([field])=>!['history','financials','announcements','evidenceIds','content','excerpt'].includes(field))):item)}
      return {truncated:true,data:Object.fromEntries(Object.entries(row).filter(([field])=>!['records','evidence','events','history'].includes(field)))}
    }

    // 解析 JSON 字段
    const result = {
      ...run,
      metadata: parseJson(run.metadata) || {},
      steps: run.steps.map((step) => ({
        ...step,
        progress: parseJson(step.progress),
        artifacts: step.artifacts.map((artifact) => {
          const parsed=parseJson(artifact.data)
          const summarized=summarizeStepArtifact(artifact.artifactKey,parsed,artifact.size||0)
          if(view==='workspace'&&artifact.artifactKey==='research-evaluation'&&parsed&&typeof parsed==='object'){
            const evaluation=parsed as Record<string,unknown>
            const evidence=Array.isArray(evaluation.evidence)?evaluation.evidence:[],events=Array.isArray(evaluation.events)?evaluation.events:[]
            return {...artifact,data:{...evaluation,evidenceTotal:evidence.length,eventsTotal:events.length,evidence:evidence.slice(0,50),events:events.slice(0,30)}}
          }
          return {...artifact,...summarized}
        })
      }))
    }

    return NextResponse.json(result)
  } catch (error) {
    console.error('Failed to get run details:', error)
    return NextResponse.json({ error: String(error) }, { status: 500 })
  }
}
