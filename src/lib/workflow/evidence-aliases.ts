/** Lossless, request-local compression. Repeated long evidence identifiers are
 * expanded before validation; aliases are never persisted as source evidence. */
export function aliasEvidence(value: unknown) {
  const counts=new Map<string,number>()
  const scan=(item:unknown,key='')=>{
    if(Array.isArray(item))item.forEach(child=>scan(child,key))
    else if(item&&typeof item==='object')Object.entries(item).forEach(([field,child])=>scan(child,field))
    else if(typeof item==='string'&&['evidenceIds','allowedEvidenceIds','evidenceId'].includes(key))counts.set(item,(counts.get(item)||0)+1)
  }
  scan(value)
  const originals=[...counts].filter(([id,count])=>id.length>16&&count>1).map(([id])=>id)
  const aliases=Object.fromEntries(originals.map((id,index)=>[`E${index+1}`,id]))
  const reverse=new Map(Object.entries(aliases).map(([alias,id])=>[id,alias]))
  const compact=(item:unknown,key=''):unknown=>{
    if(Array.isArray(item))return item.map(child=>compact(child,key))
    if(item&&typeof item==='object')return Object.fromEntries(Object.entries(item).map(([field,child])=>[field,compact(child,field)]))
    return typeof item==='string'&&['evidenceIds','allowedEvidenceIds','evidenceId'].includes(key)?reverse.get(item)||item:item
  }
  return {evidence:compact(value),aliases}
}

export function expandEvidenceAliases(value: unknown, aliases: Record<string,string>): unknown {
  const expand=(item:unknown,key=''):unknown=>{
    if(Array.isArray(item))return item.map(child=>expand(child,key))
    if(item&&typeof item==='object')return Object.fromEntries(Object.entries(item).map(([field,child])=>[field,expand(child,field)]))
    return typeof item==='string'&&['evidenceIds','evidenceId'].includes(key)?aliases[item]||item:item
  }
  return expand(value)
}
