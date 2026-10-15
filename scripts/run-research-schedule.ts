import { config } from 'dotenv'
config({quiet:true})
async function main(){
  const {runScheduledResearch}=await import('../src/lib/research/schedule')
  const {runEnabledLabs}=await import('../src/lib/research/lab/store')
  const {prisma}=await import('../src/lib/db')
  try{const results=[...await runScheduledResearch(),...await runEnabledLabs()];if(results.length)console.log(JSON.stringify(results));if(results.some(r=>r.status==='failed'))process.exitCode=1}
  finally{await prisma.$disconnect()}
}
void main().catch(error=>{console.error(error instanceof Error?error.message:'本地复核失败');process.exitCode=1})
