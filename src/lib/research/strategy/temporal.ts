export type TemporalEvidence={id:string;businessAt:string|null;publishedAt:string|null;observedAt:string;hash:string}
export function auditTemporalEvidence(evidence:TemporalEvidence[],requiredIds:string[],asOf:string,mode:'system-observed'|'public-history'='system-observed'){
  const cutoff=Date.parse(asOf),issues:string[]=[]
  if(!Number.isFinite(cutoff))issues.push('无效历史时点')
  for(const id of [...new Set(requiredIds)]){
    const item=evidence.find(row=>row.id===id)
    if(!item){issues.push(`${id}缺少冻结证据`);continue}
    const available=mode==='system-observed'?Math.max(Date.parse(item.observedAt),item.publishedAt?Date.parse(item.publishedAt):0):Date.parse(item.publishedAt||'')
    if(!item.hash||!Number.isFinite(available)||available>cutoff)issues.push(`${id}在该时点不可用或缺少可用时间`)
  }
  return {status:issues.length?'blocked' as const:'available' as const,mode,required:requiredIds.length,issues}
}
