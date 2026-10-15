export type ArtifactShape='object'|'array'|'string'|'analysis'

const shapes:Record<string,ArtifactShape>={
  'domain-research':'object', 'research-snapshot':'object','research-manifest':'object','graph-context':'object','decision-timing':'object',
  'market-snapshot':'object','market-reference-data':'object','etf-bindings':'array','etf-codes':'string','industry-info':'object',
  'etf-market-data':'array','etf-data-gaps':'object','etf-holdings':'array','holdings-summary':'object','companies':'array','company-codes':'string',
  'company-market-data':'array','news-articles':'array','news-events':'array','news-evidence-gaps':'object','news-sentiment':'object','portfolio-evidence':'object',
  'market-trends':'object','data-quality':'object','research-evaluation':'object','etf-actions':'array','market-analysis':'analysis',
  'news-analysis':'analysis','company-analysis':'analysis','industry-overview':'analysis','investment-advice':'analysis','unified-allocation':'object',
  'portfolio-decision-support':'object','portfolio-analysis':'analysis','social-report':'object','report-id':'string','report-content':'string',
}

function jsonObject(value:string){try{const parsed=JSON.parse(value);return !!parsed&&typeof parsed==='object'&&!Array.isArray(parsed)}catch{return false}}

export function validateArtifactValue(schemaId:string,value:unknown,{nullable=false}:{nullable?:boolean}={}){
  if(value==null)return nullable?{valid:true,error:null}:{valid:false,error:`${schemaId} 不能为 null`}
  const shape=shapes[schemaId]
  if(!shape)return {valid:true,error:null}
  const valid=shape==='array'?Array.isArray(value):shape==='object'?typeof value==='object'&&!Array.isArray(value):shape==='string'?typeof value==='string':typeof value==='string'?jsonObject(value):typeof value==='object'&&!Array.isArray(value)
  return valid?{valid:true,error:null}:{valid:false,error:`${schemaId} 期望 ${shape}，实际为 ${Array.isArray(value)?'array':typeof value}`}
}
