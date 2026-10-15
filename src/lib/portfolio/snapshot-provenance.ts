import { createHash } from 'node:crypto'
export function portfolioFingerprint(cashBalance:number,holdings:Array<{ticker:string;quantity:number;unitNav:number}>){
  return createHash('sha256').update(JSON.stringify({cashBalance,holdings:holdings.map(({ticker,quantity,unitNav})=>({ticker,quantity,unitNav})).sort((a,b)=>a.ticker.localeCompare(b.ticker))})).digest('hex')
}
export function confirmedPortfolioDate(value:unknown,cashBalance:number,holdings:Array<{ticker:string;quantity:number;unitNav:number}>,now=new Date().toISOString()){
  const row=value as {asOf?:string;fingerprint?:string}|null
  return row?.asOf&&Number.isFinite(Date.parse(row.asOf))&&Date.parse(row.asOf)<=Date.parse(now)&&row.fingerprint===portfolioFingerprint(cashBalance,holdings)?row.asOf:null
}
