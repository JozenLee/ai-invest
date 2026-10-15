import { prisma } from '@/lib/db'
import { fingerprint } from './kernel'
export type PipelineHealth={runId:string;reportId:string;snapshotId:string;decisionVersionId:string|null;asOf:string;report:'completed';decision:'ready'|'blocked';validation:'completed'|'failed'|'disabled';execution:'ready'|'blocked'|'failed'|'pending';reason?:string}
export async function savePipelineHealth(industryId:string,health:PipelineHealth){
  const id=`unified-pipeline:${industryId}`,payload=JSON.stringify(health)
  const data={datasetKey:'unified_pipeline_status',targetCode:industryId,provider:'unified-pipeline/v1',payload,contentHash:fingerprint(health)}
  await prisma.rawPayload.upsert({where:{id},create:{id,...data},update:{...data,fetchedAt:new Date()}})
}
