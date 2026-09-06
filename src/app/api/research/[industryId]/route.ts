import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { captureResearchSnapshot, getResearchProfile, latestEvaluation, persistEvaluation, readSnapshot, saveResearchProfile } from '@/lib/research/store'
import { evaluateResearch } from '@/lib/research/engine'
import { replayResearch } from '@/lib/research/replay'
import type { Evaluation } from '@/lib/research/contracts'
import { getResearchSchedule,saveResearchSchedule,saveResearchSettings } from '@/lib/research/schedule'
import { sameOriginRequest } from '@/lib/security/request-origin'

const busy=new Set<string>()
type Params={params:Promise<{industryId:string}>}
export async function GET(_request: NextRequest,{params}:Params) {
  try {
    const {industryId}=await params
    const evidenceId=_request.nextUrl.searchParams.get('evidence'),snapshotId=_request.nextUrl.searchParams.get('snapshot')
    if(evidenceId&&snapshotId){const snapshot=await readSnapshot(snapshotId);if(snapshot.profile.industryId!==industryId)throw new Error('快照不属于本领域');const evidence=snapshot.evidence.find(e=>e.id===evidenceId);if(!evidence)throw new Error('证据不属于本快照');return NextResponse.json({asOf:snapshot.asOf,evidence,record:snapshot.records?.[evidenceId]??null})}
    const page=_request.nextUrl.searchParams.get('page')
    if(page&&snapshotId){const snapshot=await readSnapshot(snapshotId);if(snapshot.profile.industryId!==industryId)throw new Error('快照不属于本领域');const offset=Math.max(0,Number(_request.nextUrl.searchParams.get('offset'))||0),limit=50;const items=page==='evidence'?snapshot.evidence:page==='events'?snapshot.events:null;if(!items)throw new Error('无效分页类型');return NextResponse.json({items:items.slice(offset,offset+limit),total:items.length,nextOffset:Math.min(items.length,offset+limit)})}
    const [profile,evaluation,history]=await Promise.all([getResearchProfile(industryId),latestEvaluation(industryId),prisma.rawPayload.findMany({where:{datasetKey:'research_evaluation',targetCode:industryId},orderBy:{fetchedAt:'desc'},take:30,select:{id:true,payload:true,fetchedAt:true}})])
    const schedule=await getResearchSchedule(industryId)
    const reviews=await prisma.rawPayload.findMany({where:{datasetKey:'research_review_run',targetCode:industryId},orderBy:{fetchedAt:'desc'},take:10,select:{payload:true}})
    return NextResponse.json({profile,evaluation,schedule,reviews:reviews.map(r=>JSON.parse(r.payload)),history:history.map(r=>{const e=JSON.parse(r.payload) as Evaluation;return {snapshotId:e.snapshotId,asOf:e.asOf,changes:e.changes.length,states:e.decisions.reduce<Record<string,number>>((o,d)=>({...o,[d.state]:(o[d.state]||0)+1}),{})}})})
  } catch(error){return NextResponse.json({error:error instanceof Error?error.message:'读取失败'},{status:400})}
}
export async function POST(request: NextRequest,{params}:Params) {
  const {industryId}=await params
  if(!sameOriginRequest(request))return NextResponse.json({error:'不接受跨站写入'},{status:403})
  if(busy.has(industryId))return NextResponse.json({error:'本领域正在复核，请稍后刷新'},{status:409})
  busy.add(industryId)
  try {
    const body=await request.json()
    if(body.action==='settings')return NextResponse.json(await saveResearchSettings(industryId,body.profile,body.schedule))
    if(body.action==='schedule'){await saveResearchSchedule(industryId,body.schedule);return NextResponse.json({success:true})}
    if(body.action==='profile') {await saveResearchProfile(body.profile,industryId);return NextResponse.json({success:true})}
    if(body.action==='replay'){
      if(!Array.isArray(body.snapshotIds)||body.snapshotIds.length<2||body.snapshotIds.length>100||body.snapshotIds.some((v:unknown)=>typeof v!=='string')||new Set(body.snapshotIds).size!==body.snapshotIds.length)throw new Error('请选择2–100个不重复快照')
      const snapshots=await Promise.all(body.snapshotIds.map((id:string)=>readSnapshot(id)))
      if(snapshots.some(s=>s.profile.industryId!==industryId))throw new Error('快照不属于本领域')
      return NextResponse.json(replayResearch(snapshots,snapshots.map(s=>evaluateResearch(s)),{commissionBps:body.commissionBps,slippageBps:body.slippageBps}))
    }
    if(body.action==='inspect'){
      const snapshot=await readSnapshot(String(body.snapshotId||''))
      if(snapshot.profile.industryId!==industryId)throw new Error('快照不属于本领域')
      return NextResponse.json({evaluation:evaluateResearch(snapshot)})
    }
    if(body.action!=='evaluate')throw new Error('无效操作')
    if(body.asOf)throw new Error('不允许回填历史日期；历史验证只能使用保存的冻结快照')
    const previous=await latestEvaluation(industryId)
    const snapshot=await captureResearchSnapshot(industryId)
    const evaluation=await persistEvaluation(snapshot,previous)
    return NextResponse.json({evaluation},{status:201})
  }catch(error){return NextResponse.json({error:error instanceof Error?error.message:'研究执行失败'},{status:400})}
  finally{busy.delete(industryId)}
}
