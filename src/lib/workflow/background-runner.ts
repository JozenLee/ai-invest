import { spawn } from 'node:child_process'
import { mkdir, readFile, unlink } from 'node:fs/promises'
import path from 'node:path'

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
  const child = spawn(process.execPath, ['--import', 'tsx', path.join(process.cwd(), 'scripts/run-comprehensive-analysis.ts'), runId, mode, stepName || ''], {
    cwd: process.cwd(), detached: true, stdio: ['ignore', 'ignore', 'ignore', 'ipc'], env: { ...process.env, NODE_ENV: 'production' },
  })
  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => { reject(new Error('分析后台启动超时，请检查运行状态后重试')) }, 15000)
    child.once('message', (message: any) => {
      clearTimeout(timer)
      if (message?.ready) resolve()
      else reject(new Error(message?.error || '分析后台启动失败'))
    })
    child.once('error', error => { clearTimeout(timer); reject(error) })
    child.once('exit', code => { clearTimeout(timer); if (code) reject(new Error('分析后台启动失败')) })
  })
  if (child.connected) child.disconnect()
  child.unref()
  return { alreadyRunning: false }
}
