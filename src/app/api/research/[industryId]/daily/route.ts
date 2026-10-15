import { NextRequest,NextResponse } from 'next/server'
import { sameOriginRequest } from '@/lib/security/request-origin'
import { getResearchProfile } from '@/lib/research/store'
import { refreshUnifiedResearch } from '@/lib/research/refresh'
import { dailyExecution,saveDailySelection,recordDailyFeedback,confirmDailyAccount } from '@/lib/research/lab/daily-store'
type Context={params:Promise<{industryId:string}>}
export async function GET(request:NextRequest,{params}:Context){
  try{const {industryId}=await params;await getResearchProfile(industryId);return NextResponse.json(await dailyExecution(industryId,request.nextUrl.searchParams.get('strategy')||undefined),{headers:{'Cache-Control':'no-store'}})}
  catch(error){return NextResponse.json({error:error instanceof Error?error.message:'读取执行清单失败'},{status:400})}
}
export async function POST(request:NextRequest,{params}:Context){
  if(!sameOriginRequest(request))return NextResponse.json({error:'不接受跨站写入'},{status:403})
  try{
    const {industryId}=await params;await getResearchProfile(industryId);const body=await request.json()
    if(body.action==='refresh')await refreshUnifiedResearch(industryId)
    else if(body.action==='select')await saveDailySelection(industryId,body.strategyId)
    else if(body.action==='feedback')await recordDailyFeedback(industryId,body)
    else if(body.action==='confirm-account')await confirmDailyAccount(body)
    else throw new Error('无效操作')
    return NextResponse.json(await dailyExecution(industryId),{headers:{'Cache-Control':'no-store'}})
  }catch(error){return NextResponse.json({error:error instanceof Error?error.message:'更新执行清单失败'},{status:400})}
}
