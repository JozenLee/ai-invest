import { NextRequest,NextResponse } from 'next/server'
import { sameOriginRequest } from '@/lib/security/request-origin'
import { getResearchProfile } from '@/lib/research/store'
import { getUnifiedValidation,runUnifiedValidation,verifyUnifiedValidation } from '@/lib/research/strategy/validation-store'
type Context={params:Promise<{industryId:string}>}
export async function GET(_request:NextRequest,{params}:Context){
  try{const {industryId}=await params;await getResearchProfile(industryId);return NextResponse.json(await getUnifiedValidation(industryId),{headers:{'Cache-Control':'no-store'}})}catch(error){return NextResponse.json({error:error instanceof Error?error.message:'读取验证失败'},{status:400})}
}
export async function POST(request:NextRequest,{params}:Context){
  if(!sameOriginRequest(request))return NextResponse.json({error:'不接受跨站写入'},{status:403})
  try{
    const {industryId}=await params;await getResearchProfile(industryId);const body=await request.json()
    if(body.action==='verify'){
      if(typeof body.id!=='string')throw new Error('缺少归档标识')
      return NextResponse.json(await verifyUnifiedValidation(industryId,body.id))
    }
    if(body.action!=='compare'||body.candidateId!==undefined&&typeof body.candidateId!=='string'||body.adjustmentScale!==undefined&&typeof body.adjustmentScale!=='number')throw new Error('无效验证请求')
    if(body.policyPatch!==undefined&&(!body.policyPatch||typeof body.policyPatch!=='object'||Array.isArray(body.policyPatch)||Object.entries(body.policyPatch).some(([key,value])=>!['maxExposure','maxWeight','maxTurnover','minCash','filters'].includes(key)||(key==='filters'?typeof value!=='object'||value===null:typeof value!=='number'))))throw new Error('候选策略仅允许调整显式仓位参数')
    if(body.protocol!==undefined&&(!body.protocol||typeof body.protocol!=='object'||Array.isArray(body.protocol)||Object.keys(body.protocol).some(key=>!['startDate','endDate','initialCapital','commissionBps','slippageBps','holdoutFraction','executionMode'].includes(key))))throw new Error('无效验证协议')
    return NextResponse.json(await runUnifiedValidation(industryId,{candidateId:body.candidateId,adjustmentScale:body.adjustmentScale,policyPatch:body.policyPatch,protocol:body.protocol}))
  }catch(error){return NextResponse.json({error:error instanceof Error?error.message:'验证失败'},{status:400})}
}
