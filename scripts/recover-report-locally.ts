/** Finalize retained research without importing or calling any AI client. */
import { config } from 'dotenv'
import { open, unlink } from 'node:fs/promises'
import path from 'node:path'
config({ quiet: true })

async function main() {
  const runId = process.argv[2]
  if (!/^[a-zA-Z0-9_-]+$/.test(runId || '')) throw new Error('无效执行编号')
  const lockPath = path.join(process.cwd(), '.runtime', 'analysis', runId + '.lock')
  const lock = await open(lockPath, 'wx')
  await lock.writeFile(String(process.pid)); await lock.close()
  const { prisma } = await import('../src/lib/db')
  try {
    const run = await prisma.executionRun.findUniqueOrThrow({ where: { id: runId }, include: { steps: { orderBy: { stepIndex: 'asc' }, include: { artifacts: true } } } })
    if (run.status === 'COMPLETED') { console.log('已完成，无需恢复'); return }
    const editor = run.steps.find(step => step.stepName === 'social-report')
    const final = run.steps.find(step => step.stepName === 'generate-report')
    if (!editor || !final || run.status !== 'FAILED' || run.steps.some(step => !['social-report', 'generate-report'].includes(step.stepName) && !['COMPLETED','SKIPPED'].includes(step.status)) || run.steps.some(step => step.status === 'RUNNING')) throw new Error('只能恢复上游研究均已完成、且没有执行中步骤的失败记录')
    const artifacts = new Map<string, any>()
    for (const step of run.steps) for (const artifact of step.artifacts) {
      try { artifacts.set(artifact.artifactKey, JSON.parse(artifact.data || 'null')) }
      catch { artifacts.set(artifact.artifactKey, artifact.data) }
    }
    const save = async (stepId: string, key: string, value: unknown, type = 'DATA') => {
      const data = JSON.stringify(value)
      const fields = { data, size: Buffer.byteLength(data), artifactType: type, dataType: 'JSON' }
      await prisma.stepArtifact.upsert({ where: { stepId_artifactKey: {stepId,artifactKey:key} }, create:{stepId,artifactKey:key,...fields},update:fields })
      artifacts.set(key, value)
    }
    await save(editor.id, 'social-report', null)
    await save(editor.id, 'social-report-status', { status:'unavailable', attempts:0, localRecovery:true, errors:[editor.error || '历史一页版生成失败'], message:'仅使用已保存产物在本地恢复完整报告，未重新调用外部AI' })
    const started = Date.now()
    await prisma.executionStep.update({where:{id:final.id},data:{status:'RUNNING',startedAt:new Date(),error:null}})
    const { generateReportStep } = await import('../src/lib/workflow/steps/generate-report-step')
    try {
      await generateReportStep.execute({ runId,stepId:final.id,input:{},artifacts,
        saveArtifact: (key,value,type) => save(final.id,key,value,type),
        updateProgress: async (current,total,message) => { await prisma.executionStep.update({where:{id:final.id},data:{progress:JSON.stringify({current,total,message})}}) },
      })
      await prisma.$transaction([
        prisma.executionStep.update({where:{id:editor.id},data:{status:'SKIPPED',progress:JSON.stringify({current:1,total:1,message:'一页版未重新外发AI；完整研究报告已本地恢复'})}}),
        prisma.executionStep.update({where:{id:final.id},data:{status:'COMPLETED',completedAt:new Date(),duration:Date.now()-started,error:null}}),
        prisma.executionRun.update({where:{id:runId},data:{status:'COMPLETED',completedAt:new Date(),error:null}}),
      ])
      console.log(JSON.stringify({runId,status:'COMPLETED',reportId:artifacts.get('report-id'),externalAiCalls:0}))
    } catch (error) {
      await prisma.executionStep.update({where:{id:final.id},data:{status:'FAILED',error:String(error),completedAt:new Date()}})
      throw error
    }
  } finally {
    await prisma.$disconnect()
    await unlink(lockPath)
  }
}
void main().catch(error => { console.error(error.message); process.exitCode = 1 })
