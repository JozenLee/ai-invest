import { chinaDate } from '../time'

export function labRunDue(now:Date,last?:{fetchedAt:Date;payload:string}|null){
  const local=new Date(now.getTime()+8*3600000)
  if(local.toISOString().slice(11,16)<'19:35'||[0,6].includes(local.getUTCDay()))return false
  if(!last||chinaDate(last.fetchedAt.toISOString())!==chinaDate(now.toISOString()))return true
  const status=JSON.parse(last.payload).status
  return !['completed','needs-review'].includes(status)&&now.getTime()-last.fetchedAt.getTime()>=30*60_000
}
