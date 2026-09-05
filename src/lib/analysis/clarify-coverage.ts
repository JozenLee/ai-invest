/** Models sometimes shorten "technical evidence coverage" to "ETF coverage".
 * That reverses the meaning when subscribed ETFs exist but their adjusted series is unusable. */
export function clarifyCoverageLanguage(text:string,totalETFs:number|undefined){
  if(!text||!totalETFs)return text
  return text.replace(/ETF覆盖率(?:为|是|：|:)?\s*0(?:\.0+)?%/g,`可用于决策的技术证据覆盖率为0%（已关联${totalETFs}只ETF）`)
}
