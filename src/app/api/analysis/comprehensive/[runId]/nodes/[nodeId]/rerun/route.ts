import { NextRequest, NextResponse } from 'next/server'
import { comprehensiveAnalysisWorkflow } from '@/lib/workflow/workflows/comprehensive-analysis'
import { dispatchAnalysis } from '@/lib/workflow/background-runner'
import { sameOriginRequest } from '@/lib/security/request-origin'

export async function POST(request:NextRequest,{params}:{params:Promise<{runId:string;nodeId:string}>}){
  if(!sameOriginRequest(request))return NextResponse.json({error:'不接受跨站重跑分析模块'},{status:403})
  try{
    const {runId,nodeId}=await params
    const body=await request.json().catch(()=>({}))
    const strategy=body.strategy==='node'?'node':'downstream'
    const prepared=await comprehensiveAnalysisWorkflow.prepareRerun(runId,nodeId,strategy,body.config)
    const dispatched=await dispatchAnalysis(runId,prepared.executeMode,nodeId)
    return NextResponse.json({success:true,...prepared,...dispatched},{status:202})
  }catch(error){
    return NextResponse.json({error:error instanceof Error?error.message:'模块重跑失败'},{status:400})
  }
}
