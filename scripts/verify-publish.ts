import { config } from 'dotenv'
import { readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
config({quiet:true})
async function main(){
  const [reportId,accountId,mode]=process.argv.slice(2)
  const {preparePublicReport}=await import('../src/lib/services/publish-report.service')
  const {prisma}=await import('../src/lib/db')
  try {
    const prepared=await preparePublicReport(reportId)
    console.log(JSON.stringify({reportId,title:prepared.title,contentLength:Array.from(prepared.content).length,images:prepared.images}))
    if(mode!=='--submit-private')return
    const receiptPath=path.join(process.cwd(),'.runtime','publish',reportId,'verification-receipt.json')
    // Exclusive receipt prevents accidental duplicate verification posts, even after timeout.
    await writeFile(receiptPath,JSON.stringify({status:'submitting',reportId,accountId,visibility:'仅自己可见'}),{flag:'wx'})
    const imageDataUrls=await Promise.all(prepared.images.map(async file=>'data:image/png;base64,'+(await readFile(file)).toString('base64')))
    const response=await fetch((process.env.NEXT_JS_URL||'http://127.0.0.1:3000')+'/api/publish/xhs',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({...prepared,accountId,imageDataUrls,visibility:'仅自己可见',isOriginal:true}),signal:AbortSignal.timeout(330000)})
    const result=await response.json()
    await writeFile(receiptPath,JSON.stringify({status:response.ok&&result.success?'submitted':'needs_review',reportId,result},null,2))
    console.log(JSON.stringify({httpStatus:response.status,...result}))
    if(!response.ok||!result.success)throw new Error('发布失败，禁止自动重试；请核查平台结果')
  } finally {await prisma.$disconnect()}
}
void main().catch(error=>{console.error(error);process.exitCode=1})
