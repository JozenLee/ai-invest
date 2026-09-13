import { NextRequest, NextResponse } from 'next/server'
import { createHash } from 'node:crypto'
import prisma from '@/lib/db/prisma'
import { sameOriginRequest } from '@/lib/security/request-origin'
import { buildPortfolioResearchUniverse, validateProductExecution, type ProductExecutionInput } from '@/lib/portfolio/product-research'
import { parseExecutionMaterial } from '@/lib/portfolio/execution-materials'

export const runtime='nodejs'
const response=(body:unknown,status=200)=>NextResponse.json(body,{status,headers:{'Cache-Control':'private, no-store'}})
type Saved={portfolioId?:string;data?:{buy?:ProductExecutionInput;sell?:ProductExecutionInput}}
const parse=(payload:string):Saved=>{try{return JSON.parse(payload)}catch{return {}}}
const account=()=>prisma.portfolio.findFirst({orderBy:[{isDefault:'desc'},{createdAt:'asc'}],include:{holdings:true}})

/** Private supporting material only. No Holding changes, orders, emails or public artifacts. */
export async function GET(request:NextRequest){
  if(!sameOriginRequest(request))return response({error:'不接受跨站读取执行资料'},403)
  try{
    const p=await account()
    if(!p)return response({error:'尚无当前账户'},404)
    const ticker=request.nextUrl.searchParams.get('ticker')
    const codes=p.holdings.filter(h=>h.quantity>0).map(h=>h.ticker)
    if(ticker&&!codes.includes(ticker))return response({error:'基金不属于当前持仓'},400)
    const rows=await prisma.rawPayload.findMany({where:{datasetKey:'fund_execution',targetCode:{in:ticker?[ticker]:codes},payload:{contains:JSON.stringify(p.id)}},orderBy:{fetchedAt:'desc'},take:200})
    const seen=new Set<string>(),now=new Date().toISOString()
    const records=rows.flatMap(r=>{
      const s=parse(r.payload)
      if(s.portfolioId!==p.id||!s.data||seen.has(r.targetCode))return []
      seen.add(r.targetCode)
      const checks=Object.fromEntries(Object.entries(s.data).map(([side,v])=>{try{
        const holding=p.holdings.find(h=>h.ticker===r.targetCode)!
        const checked=parseExecutionMaterial(v,holding,v.productType,now)
        return [side,validateProductExecution({...checked,asOf:now})]
      }catch{return [side,{informationReady:false,gaps:['资料结构、时效或当前持仓数量校验未通过']} ]}}))
      return [{ticker:r.targetCode,id:r.id,recordedAt:r.fetchedAt,materials:s.data,checks}]
    })
    return response({scope:'private-portfolio',records,asOf:now})
  }catch{return response({error:'读取执行资料失败'},500)}
}

/** POST body is one ProductExecutionInput. Append a new version preserving the other side. */
export async function POST(request:NextRequest){
  if(!sameOriginRequest(request))return response({error:'不接受跨站录入执行资料'},403)
  let body:unknown
  try{const raw=await request.text();if(raw.length>100000)return response({error:'资料超过100KB限制'},413);body=JSON.parse(raw)}catch{return response({error:'请求必须为JSON'},400)}
  try{
    const saved=await prisma.$transaction(async tx=>{
      const p=await tx.portfolio.findFirst({orderBy:[{isDefault:'desc'},{createdAt:'asc'}],include:{holdings:true}})
      if(!p)throw new Error('尚无当前账户')
      const ticker=(body as {ticker?:unknown})?.ticker
      const holding=p.holdings.find(h=>h.ticker===ticker&&h.quantity>0)
      if(!holding)throw new Error('基金不属于当前有效持仓')
      const now=new Date().toISOString()
      const identities=await tx.rawPayload.findMany({where:{targetCode:holding.ticker,datasetKey:{in:['fund_identity','fund_profile']},fetchedAt:{lte:new Date(now)}},orderBy:{fetchedAt:'desc'}})
      const product=buildPortfolioResearchUniverse({holdings:[holding],rawPayloads:identities,asOf:now}).products[0]
      const material=parseExecutionMaterial(body,holding,product.productType,now)
      const prior=await tx.rawPayload.findMany({where:{datasetKey:'fund_execution',targetCode:holding.ticker,payload:{contains:JSON.stringify(p.id)}},orderBy:{fetchedAt:'desc'},take:50})
      const latest=prior.map(r=>parse(r.payload)).find(s=>s.portfolioId===p.id)
      const data={...latest?.data,[material.side]:material}
      const payload=JSON.stringify({portfolioId:p.id,submittedAt:now,provenance:'user-provided-supporting-records',data})
      const r=await tx.rawPayload.create({data:{datasetKey:'fund_execution',targetCode:holding.ticker,provider:'user-provided-execution-materials',payload,contentHash:createHash('sha256').update(payload).digest('hex')}})
      return {id:r.id,ticker:holding.ticker,side:material.side,validation:validateProductExecution({...material,asOf:now})}
    })
    return response({scope:'private-portfolio',...saved,message:'已追加用户提供的执行资料；不修改持仓、不执行交易。新分析可消费，旧冻结报告不变。'},201)
  }catch(error){return response({error:error instanceof Error&&!/prisma|sqlite|database/i.test(error.message)?error.message:'执行资料保存失败'},400)}
}
