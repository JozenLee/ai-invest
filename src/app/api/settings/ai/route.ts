import { NextRequest, NextResponse } from 'next/server'
import { settingsForDisplay, saveSceneSettings, SettingsValidationError } from '@/lib/ai/scene-settings'
export const dynamic = 'force-dynamic'
const responseHeaders = { 'Cache-Control': 'private, no-store', Pragma: 'no-cache' }

// Next.js may construct nextUrl with its bind address (0.0.0.0) instead of
// the browser-facing host. Compare against the incoming request authority.
function hasValidOrigin(request: NextRequest) {
  if (request.headers.get('sec-fetch-site') === 'cross-site') return false
  const origin = request.headers.get('origin')
  if (!origin) return true
  try {
    const source = new URL(origin)
    if (!['http:', 'https:'].includes(source.protocol) || source.origin !== origin) return false
    const host = request.headers.get('host') || request.nextUrl.host
    const forwardedHost = request.headers.get('x-forwarded-host')?.split(',')[0].trim()
    const protocol = request.headers.get('x-forwarded-proto')?.split(',')[0].trim() || request.nextUrl.protocol.replace(':', '')
    if (!['http', 'https'].includes(protocol)) return false
    return [host, forwardedHost].filter(Boolean).some(authority => new URL(`${protocol}://${authority}`).origin === source.origin)
  } catch { return false }
}
export function GET(request: NextRequest) {
  if (!hasValidOrigin(request)) return NextResponse.json({ error: '请求来源无效' }, { status: 403, headers: responseHeaders })
  return NextResponse.json({ settings: settingsForDisplay() }, { headers: responseHeaders })
}
export async function PUT(request: NextRequest) {
  if (!hasValidOrigin(request)) return NextResponse.json({ error: '请求来源无效' }, { status: 403, headers: responseHeaders })
  try {
    const body = await request.json()
    saveSceneSettings(body.settings)
    return NextResponse.json({ settings: settingsForDisplay() }, { headers: responseHeaders })
  } catch (error) {
    const invalid = error instanceof SettingsValidationError || error instanceof SyntaxError
    return NextResponse.json({ error: invalid ? error.message : '配置保存失败，请检查服务对根目录 .env 的写入权限' }, { status: invalid ? 400 : 500, headers: responseHeaders })
  }
}
