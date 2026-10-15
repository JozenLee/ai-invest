import { config } from 'dotenv'
import { open, unlink } from 'node:fs/promises'
import path from 'node:path'
import { notifyAnalysisParent } from '../src/lib/workflow/worker-ipc'

config({ quiet: true })
async function main() {
  const [runId, mode, stepName] = process.argv.slice(2)
  if (!/^[a-zA-Z0-9_-]+$/.test(runId || '')) throw new Error('无效分析编号')
  const lockPath = path.join(process.cwd(), '.runtime', 'analysis', runId + '.lock')
  const lock = await open(lockPath, 'wx')
  await lock.writeFile(String(process.pid)); await lock.close()
  const { prisma } = await import('../src/lib/db/prisma')
  try {
    const { comprehensiveAnalysisWorkflow: workflow } = await import('../src/lib/workflow/workflows/comprehensive-analysis')
    const { withDatabaseBusyRetry } = await import('../src/lib/db/retry')
    const run = await prisma.executionRun.findUnique({ where: { id: runId } })
    if (!run) throw new Error('分析轮次不存在')
    // The exclusive worker lock proves there is no surviving worker for this run.
    await withDatabaseBusyRetry(()=>prisma.$transaction(async tx=>{
      const interrupted=await tx.executionStep.findMany({where:{runId,status:'RUNNING'},select:{id:true}})
      if(interrupted.length){
        const stepIds=interrupted.map(step=>step.id),completedAt=new Date(),error='上次执行被中断，后台正在恢复'
        await tx.executionAttempt.updateMany({where:{stepId:{in:stepIds},status:'RUNNING'},data:{status:'FAILED',completedAt,error}})
        await tx.executionStep.updateMany({where:{id:{in:stepIds}},data:{status:'FAILED',completedAt,error}})
      }
      await tx.executionRun.update({ where: { id: runId }, data: { status: 'RUNNING', completedAt:null, error: null } })
    },{maxWait:30_000,timeout:30_000}))
    await notifyAnalysisParent({ ready: true })
    if (process.connected) process.disconnect()
    if (mode === 'all') await workflow.executeAll(runId)
    else if (mode === 'resume') await workflow.resume(runId)
    else if (mode === 'next') await workflow.executeNext(runId)
    else if (mode === 'step' && stepName) {
      await workflow.executeStep(runId, stepName)
      await prisma.executionRun.update({ where: { id: runId }, data: { status: 'PENDING' } })
    } else throw new Error('无效执行模式')
  } catch (error) {
    const { withDatabaseBusyRetry } = await import('../src/lib/db/retry')
    await withDatabaseBusyRetry(()=>prisma.executionRun.update({ where: { id: runId }, data: { status: 'FAILED', completedAt:new Date(), error: error instanceof Error ? error.message : '分析失败' } }))
    throw error
  } finally {
    await prisma.$disconnect()
    await unlink(lockPath).catch(() => undefined)
  }
}
void main().catch(async error => {
  console.error(error)
  await notifyAnalysisParent({ error: '分析后台失败，请查看步骤错误' })
  process.exitCode = 1
})
