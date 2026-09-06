import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { checkXiaohongshuLogin, publishXiaohongshuNote } from '@/lib/services/xiaohongshu-mcp.service'
import { promises as fs } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import crypto from 'node:crypto'

function limitText(value: string, maxLength: number) {
  return Array.from(value).slice(0, maxLength).join('')
}

const VISIBILITIES = new Set(['公开可见', '仅自己可见'])

function normalizeTags(value: unknown) {
  if (!Array.isArray(value)) return []
  return value
    .filter((tag): tag is string => typeof tag === 'string')
    .map((tag) => tag.trim().replace(/^#/, ''))
    .filter(Boolean)
    .slice(0, 10)
}

async function writeImageDataUrl(value: string) {
  if (!value.startsWith('data:image/')) return { path: value, temporary: false }
  const match = value.match(/^data:image\/(png|jpeg|jpg|webp);base64,(.+)$/)
  if (!match) throw new Error('图片数据格式不支持')
  const filePath = path.join(os.tmpdir(), `ai-invest-xhs-${crypto.randomUUID()}.${match[1] === 'jpeg' ? 'jpg' : match[1]}`)
  await fs.writeFile(filePath, Buffer.from(match[2], 'base64'))
  return { path: filePath, temporary: true }
}

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({}))
  const reportId = typeof body.reportId === 'string' ? body.reportId : ''
  const sourceReport = reportId ? await prisma.aIAnalysisReport.findUnique({ where: { id: reportId } }) : null
  let reportData: any = null
  try { reportData = JSON.parse(sourceReport?.dataJson || '{}') } catch { /* Invalid legacy report. */ }
  if (sourceReport?.type !== 'comprehensive' || !reportData?.socialReport || !reportData?.metadata?.runId) return NextResponse.json({ success: false, error: '请选择综合分析流程生成的社媒版报告' }, { status: 400 })
  const accountId = typeof body.accountId === 'string' ? body.accountId.trim() : ''
  const title = typeof body.title === 'string' ? body.title.trim() : ''
  const content = typeof body.content === 'string' ? body.content.trim() : ''
  const imageDataUrls = Array.isArray(body.imageDataUrls) ? body.imageDataUrls.filter((item: unknown) => typeof item === 'string') : []
  const visibility = typeof body.visibility === 'string' && VISIBILITIES.has(body.visibility) ? body.visibility : undefined
  const scheduleAt = typeof body.scheduleAt === 'string' ? body.scheduleAt.trim() : ''
  const tags = normalizeTags(body.tags)

  if (!accountId || !title || !content || imageDataUrls.length === 0) {
    return NextResponse.json({ success: false, error: '账号、标题、正文和至少一张图片不能为空' }, { status: 400 })
  }

  const account = await prisma.xiaohongshuAccount.findUnique({ where: { id: accountId } })
  if (!account || !account.enabled || account.authType !== 'personal_app') {
    return NextResponse.json({ success: false, error: '个人小红书账号配置不存在或已停用' }, { status: 400 })
  }

  const temporaryFiles: string[] = []
  try {
    const loginPayload = await checkXiaohongshuLogin()
    const login = loginPayload.data || loginPayload
    const identity = login.user_id || login.username
    if (!(login.is_logged_in ?? login.logged_in ?? login.isLoggedIn ?? login.loggedIn) || !identity || ![account.accountId, account.displayName].includes(identity)) throw new Error('当前MCP登录账号与所选发布账号不匹配，请重新确认登录')
    const images = []
    for (const imageDataUrl of imageDataUrls) {
      const image = await writeImageDataUrl(imageDataUrl)
      images.push(image.path)
      if (image.temporary) temporaryFiles.push(image.path)
    }

    const payload = await publishXiaohongshuNote({
      title: limitText(title, 20),
      content: limitText(content, 1000),
      images,
      tags,
      scheduleAt,
      visibility: visibility || (account.defaultVisibility === 'private' ? '仅自己可见' : '公开可见'),
      isOriginal: body.isOriginal !== false,
    })
    return NextResponse.json({ success: true, data: payload.data ?? payload })
  } catch (error) {
    return NextResponse.json({ success: false, error: error instanceof Error ? error.message : '小红书发布失败' }, { status: 502 })
  } finally {
    await Promise.all(temporaryFiles.map((filePath) => fs.unlink(filePath).catch(() => undefined)))
  }
}
