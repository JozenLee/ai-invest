const DEFAULT_MCP_URL = 'http://127.0.0.1:18060'
const DEFAULT_MCP_TIMEOUT_MS = 300_000

function getMcpUrl(path: string) {
  const baseUrl = process.env.XHS_MCP_URL || DEFAULT_MCP_URL
  return `${baseUrl.replace(/\/$/, '')}${path}`
}

async function mcpRequest(path: string, init: RequestInit = {}) {
  const headers = new Headers(init.headers)
  headers.set('Content-Type', 'application/json')
  const authToken = process.env.XHS_MCP_AUTH_TOKEN
  if (authToken) headers.set('Authorization', `Bearer ${authToken}`)

  const configuredTimeout = Number(process.env.XHS_MCP_TIMEOUT_MS || DEFAULT_MCP_TIMEOUT_MS)
  const timeoutMs = Number.isFinite(configuredTimeout) && configuredTimeout > 0 ? configuredTimeout : DEFAULT_MCP_TIMEOUT_MS
  const response = await fetch(getMcpUrl(path), {
    ...init,
    headers,
    signal: AbortSignal.timeout(timeoutMs),
  })
  const payload = await response.json().catch(() => ({}))
  if (!response.ok) {
    throw new Error(payload.error || payload.message || `小红书 MCP 请求失败（${response.status}）`)
  }
  if (payload.success === false) throw new Error(payload.error || payload.message || '小红书 MCP 返回发布/请求失败')
  return payload
}

export function checkXiaohongshuLogin() {
  return mcpRequest('/api/v1/login/status', { method: 'GET' })
}

export function getXiaohongshuLoginQrcode() {
  return mcpRequest('/api/v1/login/qrcode', { method: 'GET' })
}

export interface XiaohongshuPublishInput {
  title: string
  content: string
  images: string[]
  tags?: string[]
  scheduleAt?: string
  visibility?: '公开可见' | '仅自己可见'
  isOriginal?: boolean
}

export function publishXiaohongshuNote(input: XiaohongshuPublishInput) {
  return mcpRequest('/api/v1/publish', {
    method: 'POST',
    body: JSON.stringify({
      title: input.title,
      content: input.content,
      images: input.images,
      tags: input.tags || [],
      schedule_at: input.scheduleAt || '',
      visibility: input.visibility || '仅自己可见',
      is_original: input.isOriginal ?? true,
    }),
  })
}
