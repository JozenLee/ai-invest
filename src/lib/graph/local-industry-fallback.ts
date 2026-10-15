import { prisma } from '@/lib/db'

type IndustryGraph = Record<string, unknown> & { id?: string }

export async function frozenIndustryGraphs():Promise<IndustryGraph[]> {
  const row=await prisma.rawPayload.findFirst({where:{datasetKey:'industry_graph'},orderBy:{fetchedAt:'desc'},select:{payload:true}})
  if(!row)return []
  try {
    const value=JSON.parse(row.payload)
    return Array.isArray(value)?value.filter(item=>item&&typeof item==='object'):[]
  } catch { return [] }
}

export async function frozenIndustryGraph(id:string) {
  return (await frozenIndustryGraphs()).find(item=>item.id===id)||null
}

export function frozenIndustrySummaries(rows:IndustryGraph[]) {
  return rows.map(row=>({
    id:row.id,code:row.code,name:row.name,description:row.description,version:row.version,
    revisionId:row.revisionId||row.revision_id,contentHash:row.contentHash||row.content_hash,
    mappingRevisionId:row.mappingRevisionId||row.mapping_revision_id,mappingContentHash:row.mappingContentHash||row.mapping_content_hash,
    mappingPublishedAt:row.mappingPublishedAt||row.mapping_published_at,publishedAt:row.publishedAt||row.published_at,updatedAt:row.updatedAt||row.updated_at,
  }))
}
