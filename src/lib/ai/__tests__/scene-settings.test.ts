// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest'
const state = vi.hoisted(() => ({ env: '', temp: '', create: vi.fn(), options: vi.fn() }))
vi.mock('node:fs', () => ({
  readFileSync: () => state.env,
  statSync: () => ({ mode: 0o600 }),
  writeFileSync: (_file: string, text: string) => { state.temp = text },
  renameSync: () => { state.env = state.temp },
}))
vi.mock('@anthropic-ai/sdk', () => ({ default: class {
  constructor(options: unknown) { state.options(options) }
  messages = { create: state.create, stream: state.create }
} }))
import { getSceneSettings, publicSettings, saveSceneSettings } from '../scene-settings'
import { sceneAnthropic } from '../scene-client'
import { GET, PUT } from '@/app/api/settings/ai/route'
import { NextRequest } from 'next/server'
const drafts = () => publicSettings().map(row => ({ ...row }))
beforeEach(() => { state.env = '# keep comment\nANTHROPIC_API_KEY=global-secret\nCLAUDE_MODEL=legacy-model\nUNRELATED=value\n'; vi.clearAllMocks() })
describe('scene settings', () => {
  it('separates defaults even when the legacy global model is configured', () => {
    expect(getSceneSettings('news').model).toBe('claude-sonnet-5')
    expect(getSceneSettings('comprehensive').model).toBe('claude-opus-5')
    expect(JSON.stringify(publicSettings())).not.toContain('global-secret')
  })
  it('persists settings without touching other root environment settings', () => {
    const settings = drafts().map(row => row.scene === 'news' ? { ...row, model: 'custom-model', apiKey: 'scene-secret', maxTokens: 2048 } : row)
    saveSceneSettings(settings)
    expect(state.env).toContain('# keep comment\nANTHROPIC_API_KEY=global-secret')
    expect(state.env).toContain('UNRELATED=value')
    expect(getSceneSettings('news')).toMatchObject({ model: 'custom-model', apiKey: 'scene-secret', maxTokens: 2048 })
    expect(getSceneSettings('comprehensive').model).toBe('claude-opus-5')
    saveSceneSettings(drafts())
    expect(getSceneSettings('news').apiKey).toBe('scene-secret')
    saveSceneSettings(drafts().map(row => ({ ...row, resetToken: true })))
    expect(getSceneSettings('news').apiKey).toBe('global-secret')
  })
  it('rejects invalid input atomically and never includes credentials in errors', () => {
    const original = state.env
    expect(() => saveSceneSettings(drafts().map(row => ({ ...row, apiKey: 'secret\nINJECT=bad' })))).toThrow('API Token 格式无效')
    expect(() => saveSceneSettings(drafts().map(row => ({ ...row, maxTokens: 0 })))).toThrow()
    expect(() => saveSceneSettings(drafts().map(row => ({ ...row, scene: 'news' })))).toThrow()
    expect(state.env).toBe(original)
  })
  it('updates an existing client on the next request, including token rotation and budget', async () => {
    const client = sceneAnthropic('news')
    const request = { model: 'hardcoded', max_tokens: 9999, messages: [{ role: 'user' as const, content: 'test' }] }
    await client.messages.create(request)
    expect(state.create).toHaveBeenLastCalledWith(expect.objectContaining({ model: 'claude-sonnet-5' }))
    saveSceneSettings(drafts().map(row => row.scene === 'news' ? { ...row, model: 'new-model', apiKey: 'rotated-key', maxTokens: 3000 } : row))
    await client.messages.create(request)
    expect(state.create).toHaveBeenLastCalledWith(expect.objectContaining({ model: 'new-model', max_tokens: 3000 }))
    expect(state.options).toHaveBeenLastCalledWith(expect.objectContaining({ apiKey: 'rotated-key' }))
  })
  it('returns effective tokens only in the uncached settings response and rejects cross-origin writes', async () => {
    const loaded = GET(new NextRequest('http://localhost/api/settings/ai'))
    expect(loaded.headers.get('cache-control')).toContain('no-store')
    expect((await loaded.json()).settings[0]).toMatchObject({ apiKey: 'global-secret', tokenSource: 'global' })
    const response = await PUT(new NextRequest('http://localhost/api/settings/ai', { method: 'PUT', headers: { origin: 'http://localhost' }, body: JSON.stringify({ settings: drafts().map(row => ({ ...row, apiKey: 'private-token' })) }) }))
    expect(response.status).toBe(200)
    expect((await response.json()).settings[0].apiKey).toBe('private-token')
    const rejected = await PUT(new NextRequest('http://localhost/api/settings/ai', { method: 'PUT', headers: { origin: 'https://other.example' }, body: '{}' }))
    expect(rejected.status).toBe(403)
  })
  it.each([
    ['localhost', 'http://localhost:3000', { host: 'localhost:3000' }],
    ['LAN address', 'http://192.168.1.8:3000', { host: '192.168.1.8:3000' }],
    ['HTTPS proxy', 'https://invest.example', { host: 'internal:3000', 'x-forwarded-host': 'invest.example', 'x-forwarded-proto': 'https' }],
  ])('allows same-origin saves through %s despite the internal bind address', async (_label, origin, headers) => {
    const response = await PUT(new NextRequest('http://0.0.0.0:3000/api/settings/ai', {
      method: 'PUT', headers: { ...headers, origin, 'sec-fetch-site': 'same-origin' },
      body: JSON.stringify({ settings: drafts() }),
    }))
    expect(response.status).toBe(200)
    expect(getSceneSettings('news').tokenSource).toBe('global')
  })
  it.each([
    { origin: 'https://evil.example', host: 'localhost:3000', 'sec-fetch-site': 'cross-site' },
    { origin: 'null', host: 'localhost:3000', 'sec-fetch-site': 'same-origin' },
    { origin: 'http://localhost:3000', host: 'localhost:3000', 'sec-fetch-site': 'cross-site' },
  ])('rejects cross-origin access without disclosing tokens', async headers => {
    const request = new NextRequest('http://0.0.0.0:3000/api/settings/ai', { headers })
    const response = GET(request)
    expect(response.status).toBe(403)
    expect(await response.text()).not.toContain('global-secret')
  })

})
