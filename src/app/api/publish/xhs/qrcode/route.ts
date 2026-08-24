import { NextResponse } from 'next/server'
import { getXiaohongshuLoginQrcode } from '@/lib/services/xiaohongshu-mcp.service'

function findValue(value: unknown): unknown {
  if (typeof value === 'string') return value
  if (!value || typeof value !== 'object') return null
  const record = value as Record<string, unknown>
  for (const key of ['imageDataUrl', 'data_url', 'dataUrl', 'img', 'image', 'qrcode', 'qr_code', 'qrCode', 'base64', 'url']) {
    if (typeof record[key] === 'string' && record[key]) return record[key]
  }
  for (const key of ['data', 'result', 'payload']) {
    const nested = findValue(record[key])
    if (nested) return nested
  }
  return null
}

function normalizeImage(value: string) {
  if (value.startsWith('data:image/') || value.startsWith('http://') || value.startsWith('https://') || value.startsWith('blob:')) return value
  if (value.trim().startsWith('<svg')) return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(value)}`
  return `data:image/png;base64,${value.replace(/^data:[^;]+;base64,/, '')}`
}

export async function GET() {
  try {
    const payload = await getXiaohongshuLoginQrcode()
    const raw = payload.data ?? payload
    const image = findValue(raw)
    return NextResponse.json({
      success: true,
      data: {
        ...(raw && typeof raw === 'object' ? raw : {}),
        imageDataUrl: typeof image === 'string' ? normalizeImage(image) : null,
      },
    })
  } catch (error) {
    const message = error instanceof Error && error.message === 'fetch failed'
      ? '小红书 MCP 服务未启动，请先启动本机 MCP 服务（默认端口 18060）'
      : error instanceof Error ? error.message : '获取小红书登录二维码失败'
    return NextResponse.json(
      { success: false, error: message },
      { status: 502 },
    )
  }
}
