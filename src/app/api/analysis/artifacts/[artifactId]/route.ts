import { NextResponse } from 'next/server'
import { comprehensiveAnalysisWorkflow } from '@/lib/workflow/workflows/comprehensive-analysis'

export async function GET(request:Request,{params}:{params:Promise<{artifactId:string}>}){
  const {artifactId}=await params
  const artifact=await comprehensiveAnalysisWorkflow.getArtifactLineage(artifactId)
  if(!artifact)return NextResponse.json({error:'产物版本不存在'},{status:404})
  const includeData=new URL(request.url).searchParams.get('includeData')==='true'
  let data:unknown=undefined
  if(includeData)try{data=JSON.parse(artifact.data||'null')}catch{data=artifact.data}
  return NextResponse.json({...artifact,data:includeData?data:undefined})
}
