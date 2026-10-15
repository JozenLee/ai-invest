import { spawn } from 'node:child_process'
import { closeSync, openSync } from 'node:fs'
import { mkdir, readFile, unlink } from 'node:fs/promises'
import path from 'node:path'

async function markWorkerExit(runId:string,message:string){
  const [{prisma},{withDatabaseBusyRetry}]=await Promise.all([import('@/lib/db'),import('@/lib/db/retry')])
  await withDatabaseBusyRetry(()=>prisma.$transaction(async tx=>{
    const run=await tx.executionRun.findUnique({where:{id:runId},select:{status:true}})
    if(!run||run.status!=='RUNNING')return
    const completedAt=new Date(),steps=await tx.executionStep.findMany({where:{runId,status:'RUNNING'},select:{id:true}}),stepIds=steps.map(step=>step.id)
    if(stepIds.length){
      await tx.executionAttempt.updateMany({where:{stepId:{in:stepIds},status:'RUNNING'},data:{status:'FAILED',completedAt,error:message}})
      await tx.executionStep.updateMany({where:{id:{in:stepIds}},data:{status:'FAILED',completedAt,error:message}})
    }
    await tx.executionRun.update({where:{id:runId},data:{status:'FAILED',completedAt,error:message}})
  },{maxWait:30_000,timeout:30_000}))
}

/** Reconcile a persisted RUNNING run with its OS worker lock. */
export async function reconcileStaleAnalysisRun(runId:string){
  if(!/^[a-zA-Z0-9_-]+$/.test(runId))return false
  const lockPath=path.join(process.cwd(),'.runtime','analysis',runId+'.lock')
  let stale=false
  try{
    const pid=Number(await readFile(lockPath,'utf8'))
    if(!Number.isInteger(pid)||pid<=0)stale=true
    else try{process.kill(pid,0);return false}catch(error){if((error as NodeJS.ErrnoException).code==='ESRCH')stale=true;else throw error}
  }catch(error){if((error as NodeJS.ErrnoException).code==='ENOENT')stale=true;else throw error}
  if(!stale)return false
  await unlink(lockPath).catch(()=>undefined)
  await markWorkerExit(runId,'后台分析进程异常退出，已停止等待；请继续本轮重试')
  return true
}

export async function dispatchAnalysis(runId: string, mode: string, stepName?: string | null) {
  if (!/^[a-zA-Z0-9_-]+$/.test(runId) || !['all', 'next', 'resume', 'step'].includes(mode)) throw new Error('无效执行参数')
  const directory = path.join(process.cwd(), '.runtime', 'analysis')
  await mkdir(directory, { recursive: true })
  const lockPath = path.join(directory, runId + '.lock')
  try {
    const pid = Number(await readFile(lockPath, 'utf8'))
    if (Number.isInteger(pid) && pid > 0) {
      try { process.kill(pid, 0); return { alreadyRunning: true } } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'ESRCH') throw error
      }
    } else throw new Error('后台启动中，请稍后重试')
    await unlink(lockPath)
  } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error }
  if (['all','resume'].includes(mode)) {
    const healthUrl=new URL('/health',process.env.DATA_SERVICE_URL||'http://localhost:8000').toString()
    try {
      const response=await fetch(healthUrl,{cache:'no-store',signal:AbortSignal.timeout(5000)})
      if(!response.ok)throw new Error(`HTTP ${response.status}`)
    } catch (error) {
      throw new Error(`数据服务健康检查失败，未启动分析后台进程：${error instanceof Error?error.message:'连接失败'}`)
    }
  }
  const logDirectory=path.join(process.cwd(),'logs','analysis')
  await mkdir(logDirectory,{recursive:true})
  const workerLogPath=path.join(logDirectory,runId+'.log')
  const workerLogFd=openSync(workerLogPath,'a')
  let child:ReturnType<typeof spawn>
  try {
    child = spawn(process.execPath, ['--import', 'tsx', path.join(process.cwd(), 'scripts/run-comprehensive-analysis.ts'), runId, mode, stepName || ''], {
      cwd: process.cwd(), detached: true, stdio: ['ignore', workerLogFd, workerLogFd, 'ipc'], env: { ...process.env, NODE_ENV: 'production' },
    })
  } finally { closeSync(workerLogFd) }
  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => { reject(new Error('分析后台启动超时，请检查运行状态后重试')) }, 15000)
    child.once('message', (message: unknown) => {
      clearTimeout(timer)
      const payload=message&&typeof message==='object'?message as {ready?:boolean;error?:string}:{}
      if (payload.ready) resolve()
      else reject(new Error(payload.error || '分析后台启动失败'))
    })
    child.once('error', error => { clearTimeout(timer); reject(error) })
    child.once('exit', code => { clearTimeout(timer); if (code) reject(new Error('分析后台启动失败')) })
  })
  child.once('exit',(code,signal)=>{
    if(code===0&&!signal)return
    void markWorkerExit(runId,`后台分析进程异常退出${signal?`（${signal}）`:code!==null?`（退出码 ${code}）`:''}；日志 ${path.relative(process.cwd(),workerLogPath)}；请在修复后继续本轮重试`).catch(()=>undefined).finally(()=>unlink(lockPath).catch(()=>undefined))
  })
  if (child.connected) child.disconnect()
  child.unref()
  return { alreadyRunning: false }
}
