import { config } from 'dotenv'
import { mkdir, open, readFile, unlink } from 'node:fs/promises'
import path from 'node:path'
import crypto from 'node:crypto'
import { spawn } from 'node:child_process'
config({ quiet: true })

async function main() {
  const directory = path.join(process.cwd(), '.runtime', 'publish')
  await mkdir(directory, { recursive: true })
  const lockPath = path.join(directory, 'worker.lock')
  try {
    const pid = Number(await readFile(lockPath, 'utf8'))
    try { process.kill(pid, 0); return } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ESRCH') throw error }
    await unlink(lockPath)
  } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error }
  const lock = await open(lockPath, 'wx').catch(() => null)
  if (!lock) return
  await lock.writeFile(String(process.pid)); await lock.close()
  const { prisma } = await import('../src/lib/db/prisma')
  try {
    const { getPublishSchedule, dueSlots } = await import('../src/lib/publish-schedule')
    const schedule = await getPublishSchedule()
    // A previous worker exited. Never retry a possibly accepted platform request.
    await prisma.$executeRawUnsafe("UPDATE publish_schedule_runs SET status='needs_review',error='后台中断，请核查流程与平台结果；未自动重发',updatedAt=? WHERE status IN ('generating','publishing')", new Date().toISOString())
    const slots = dueSlots(schedule)
    for (const slot of slots) for (const industryId of schedule.industryIds) {
      await prisma.$executeRawUnsafe('INSERT OR IGNORE INTO publish_schedule_runs (id,slot,industryId,status,config,createdAt,updatedAt) VALUES (?,?,?,?,?,?,?)', crypto.randomUUID(), slot, industryId, 'queued', JSON.stringify(schedule), new Date().toISOString(), new Date().toISOString())
    }
    const jobs = await prisma.$queryRawUnsafe<Array<{ id: string; industryId: string; config: string }>>("SELECT * FROM publish_schedule_runs WHERE status='queued' ORDER BY slot,industryId")
    const base = process.env.NEXT_JS_URL || 'http://127.0.0.1:3000'
    const api = async (url: string, body?: unknown) => {
      const res = await fetch(base + url, { method: body === undefined ? 'GET' : 'POST', headers: { 'Content-Type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body), signal: AbortSignal.timeout(60000) })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`)
      return data
    }
    for (const job of jobs) {
      let publishing = false
      try {
        const saved = JSON.parse(job.config)
        const current = await getPublishSchedule()
        if (!current.enabled || !current.industryIds.includes(job.industryId) || JSON.stringify(current) !== JSON.stringify(saved)) {
          await prisma.$executeRawUnsafe("UPDATE publish_schedule_runs SET status='cancelled' WHERE id=?", job.id)
          continue
        }
        const account = await prisma.xiaohongshuAccount.findUnique({ where: { id: saved.accountId } })
        if (!account?.enabled) throw new Error('发布账号已停用')
        const { checkXiaohongshuLogin, publishXiaohongshuNote } = await import('../src/lib/services/xiaohongshu-mcp.service')
        const loginResponse = await checkXiaohongshuLogin()
        const login = loginResponse.data || loginResponse
        if (!(login.logged_in ?? login.loggedIn ?? login.is_logged_in ?? login.isLoggedIn)) throw new Error('小红书未登录，请在发布设置扫码')
        const loginIdentity = typeof login.user_id === 'string' && login.user_id.trim() ? login.user_id.trim() : typeof login.username === 'string' ? login.username.trim() : ''
        if (!loginIdentity || ![account.accountId, account.displayName].includes(loginIdentity)) throw new Error('MCP当前账号与计划账号无法匹配，请重新扫码确认账号后保存计划')
        await prisma.$executeRawUnsafe("UPDATE publish_schedule_runs SET status='generating',updatedAt=? WHERE id=?", new Date().toISOString(), job.id)
        const { runId } = await api('/api/analysis/comprehensive', { industryId: job.industryId, publicOnly: true })
        await prisma.$executeRawUnsafe('UPDATE publish_schedule_runs SET runId=? WHERE id=?', runId, job.id)
        await api(`/api/analysis/comprehensive/${runId}/execute`, { mode: 'all' })
        let reportId: string | undefined
        const deadline = Date.now() + 90 * 60000
        while (Date.now() < deadline) {
          const run = await api(`/api/analysis/comprehensive/${runId}`)
          if (run.status === 'FAILED') throw new Error(run.error || '综合分析失败')
          if (run.status === 'COMPLETED') {
            reportId = run.steps.find((s: any) => s.stepName === 'generate-report')?.artifacts.find((a: any) => a.artifactKey === 'report-id')?.data
            break
          }
          await new Promise(resolve => setTimeout(resolve, 5000))
        }
        if (!reportId) throw new Error('分析未生成报告或已超时')
        await prisma.$executeRawUnsafe('UPDATE publish_schedule_runs SET reportId=? WHERE id=?', reportId, job.id)
        const { preparePublicReport } = await import('../src/lib/services/publish-report.service')
        const prepared = await preparePublicReport(reportId)
        const latest = await getPublishSchedule()
        const activeAccount = await prisma.xiaohongshuAccount.findUnique({ where: { id: saved.accountId } })
        if (!activeAccount?.enabled || !latest.enabled || JSON.stringify(latest) !== JSON.stringify(current)) throw new Error('计划或账号已变更，已停止本次发布，请检查已生成报告')
        publishing = true
        await prisma.$executeRawUnsafe("UPDATE publish_schedule_runs SET status='publishing',updatedAt=? WHERE id=?", new Date().toISOString(), job.id)
        const result = await publishXiaohongshuNote({ title: prepared.title, content: prepared.content, images: prepared.images, tags: saved.tags, visibility: saved.visibility, isOriginal: saved.isOriginal })
        if (result.success === false) throw new Error(result.error || result.message || '平台拒绝发布')
        await prisma.$executeRawUnsafe("UPDATE publish_schedule_runs SET status='published',updatedAt=? WHERE id=?", new Date().toISOString(), job.id)
      } catch (error) {
        await prisma.$executeRawUnsafe('UPDATE publish_schedule_runs SET status=?,error=?,updatedAt=? WHERE id=?', publishing ? 'needs_review' : 'failed', String(error), new Date().toISOString(), job.id)
      }
    }
  } finally { await prisma.$disconnect(); await unlink(lockPath) }
}
async function enqueue() {
  const { prisma } = await import('../src/lib/db/prisma')
  try {
    const { getPublishSchedule, dueSlots } = await import('../src/lib/publish-schedule')
    const schedule = await getPublishSchedule()
    for (const slot of dueSlots(schedule)) for (const industryId of schedule.industryIds) {
      await prisma.$executeRawUnsafe('INSERT OR IGNORE INTO publish_schedule_runs (id,slot,industryId,status,config,createdAt,updatedAt) VALUES (?,?,?,?,?,?,?)', crypto.randomUUID(), slot, industryId, 'queued', JSON.stringify(schedule), new Date().toISOString(), new Date().toISOString())
    }
    const queued = await prisma.$queryRawUnsafe<Array<{ id: string }>>("SELECT id FROM publish_schedule_runs WHERE status IN ('queued','generating','publishing') LIMIT 1")
    if (queued.length) {
      const child = spawn(process.execPath, ['--import', 'tsx', path.join(process.cwd(), 'scripts/run-publish-schedule.ts'), '--worker'], { cwd: process.cwd(), env: process.env, detached: true, stdio: 'ignore' })
      child.on('error', console.error); child.unref()
    }
  } finally { await prisma.$disconnect() }
}
void (process.argv.includes('--worker') ? main() : enqueue()).catch(error => { console.error(error); process.exitCode = 1 })
