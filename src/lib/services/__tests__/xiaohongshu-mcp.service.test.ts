import { afterEach, describe, expect, it, vi } from 'vitest'
import { publishXiaohongshuNote } from '../xiaohongshu-mcp.service'

describe('Xiaohongshu MCP publish options', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
    vi.unstubAllGlobals()
  })

  it('maps AI hardware research publishing options to the MCP payload', async () => {
    vi.stubEnv('XHS_MCP_URL', 'http://mcp.test')
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ success: true, data: { queued: true } }), { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)

    await publishXiaohongshuNote({
      title: 'AI算力硬件产业链观察',
      content: '资讯与产业链分析测试内容',
      images: ['/tmp/ai-hardware-cover.jpg'],
      tags: ['AI算力硬件', '产业链', '英伟达'],
      scheduleAt: '2026-08-18T10:30:00.000Z',
      visibility: '公开可见',
      isOriginal: true,
    })

    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [, request] = fetchMock.mock.calls[0]
    expect(JSON.parse(request.body)).toEqual({
      title: 'AI算力硬件产业链观察',
      content: '资讯与产业链分析测试内容',
      images: ['/tmp/ai-hardware-cover.jpg'],
      tags: ['AI算力硬件', '产业链', '英伟达'],
      schedule_at: '2026-08-18T10:30:00.000Z',
      visibility: '公开可见',
      is_original: true,
    })
  })
})
