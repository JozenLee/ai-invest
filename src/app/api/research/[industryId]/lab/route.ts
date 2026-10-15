import { NextRequest, NextResponse } from 'next/server'
import { sameOriginRequest } from '@/lib/security/request-origin'
import { getResearchProfile } from '@/lib/research/store'
import { getLab, runLab, setLabEnabled } from '@/lib/research/lab/store'

type Context={params:Promise<{industryId:string}>}
export async function GET(_request:NextRequest,{params}:Context){
  try{const {industryId}=await params;await getResearchProfile(industryId);return NextResponse.json(await getLab(industryId))}
  catch(error){return NextResponse.json({error:error instanceof Error?error.message:'读取实验失败'},{status:400})}
}
export async function POST(request:NextRequest,{params}:Context){
  if(!sameOriginRequest(request))return NextResponse.json({error:'不接受跨站写入'},{status:403})
  try{
    const {industryId}=await params;await getResearchProfile(industryId)
    const body=await request.json()
    if(body.action==='settings'){
      if(typeof body.enabled!=='boolean')throw new Error('enabled必须为布尔值')
      await setLabEnabled(industryId,body.enabled)
    }else if(body.action==='run')await runLab(industryId)
    else throw new Error('无效实验操作')
    return NextResponse.json(await getLab(industryId))
  }catch(error){return NextResponse.json({error:error instanceof Error?error.message:'实验运行失败'},{status:400})}
}
