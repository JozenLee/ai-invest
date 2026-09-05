const stopwords=new Set(['行业','产业','硬件','公司','市场','发展','相关','投资','股份','科技','信息','系统','中国','关于','公告','集团','网络','电子','数据','人工','智能'])
const latinStopwords=new Set(['ai','aigc'])
export function researchTerms(values: unknown[]) {
  const terms=new Set<string>()
  for(const raw of values){
    const text=String(raw||'').trim()
    for(const token of text.match(/[A-Za-z][A-Za-z0-9.+-]{1,}|[\u4e00-\u9fff]+/g)||[]){
      if(/[\u4e00-\u9fff]/.test(token))for(let i=0;i<token.length-1;i++){const pair=token.slice(i,i+2);if(!stopwords.has(pair))terms.add(pair)}
      else if(!latinStopwords.has(token.toLowerCase()))terms.add(token.toLowerCase())
    }
  }
  return [...terms].filter(term=>term.length>=2)
}
export function matchesResearchDomain(title: string,content: string,terms: string[]){
  if(!terms.length)return false
  const text=`${title} ${content}`.toLowerCase()
  return terms.some(term=>text.includes(term.toLowerCase()))
}
