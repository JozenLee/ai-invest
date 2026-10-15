import type { PaperResult } from './contracts'
export function participationMetrics(result:PaperResult){
  const rows=result.equity
  let longestCashRun=0,current=0
  for(const row of rows){current=row.cashWeight>=.99?current+1:0;longestCashRun=Math.max(longestCashRun,current)}
  const daily=rows.slice(1).map((row,i)=>({strategy:row.equity/rows[i].equity-1,benchmark:row.benchmark/rows[i].benchmark-1}))
  const capture=(direction:1|-1)=>{const sample=daily.filter(d=>d.benchmark*direction>0);return sample.length?sample.reduce((s,d)=>s+d.strategy,0)/sample.reduce((s,d)=>s+d.benchmark,0)*100:null}
  return {averageExposurePct:rows.length?rows.reduce((s,r)=>s+(1-r.cashWeight)*100,0)/rows.length:null,cashSessions:rows.filter(r=>r.cashWeight>=.99).length,longestCashRun,tradeSessions:new Set(result.fills.map(f=>f.date)).size,upCapturePct:capture(1),downCapturePct:capture(-1),basis:'平均仓位采用日终权重；现金≥99%计空仓日；上涨/下跌捕获为对应基准涨跌日的策略收益和除以基准收益和，不含首日建仓收益。'}
}
