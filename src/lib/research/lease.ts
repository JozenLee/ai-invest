import { randomUUID } from 'node:crypto'
import { prisma } from '@/lib/db'

/** Compare-and-swap leases work across Next workers and scheduler processes. */
export async function withResearchLease<T>(key:string,industryId:string,work:()=>Promise<T>,ttlMs=900_000):Promise<T>{
  const id=`research-lease:${key}:${industryId}`,owner=randomUUID(),now=Date.now()
  const payload=JSON.stringify({owner,expiresAt:now+ttlMs}),data={datasetKey:'research_lease',targetCode:industryId,provider:'local',payload,contentHash:owner}
  try{await prisma.rawPayload.create({data:{id,...data}})}catch(error){
    if((error as {code?:string}).code!=='P2002')throw error
    const old=await prisma.rawPayload.findUnique({where:{id}})
    if(!old||JSON.parse(old.payload).expiresAt>now)throw new Error('该领域已有研究任务运行，请稍后刷新')
    const claimed=await prisma.rawPayload.updateMany({where:{id,contentHash:old.contentHash},data:{...data,fetchedAt:new Date()}})
    if(claimed.count!==1)throw new Error('研究任务已被其他进程接管')
  }
  // A long-running workflow keeps its lease; a crashed process stops renewing.
  const heartbeat=setInterval(()=>{void prisma.rawPayload.updateMany({where:{id,contentHash:owner},data:{payload:JSON.stringify({owner,expiresAt:Date.now()+ttlMs}),fetchedAt:new Date()}}).catch(()=>{})},Math.floor(ttlMs/3))
  try{return await work()}finally{clearInterval(heartbeat);await prisma.rawPayload.deleteMany({where:{id,contentHash:owner}})}
}
