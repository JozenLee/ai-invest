import { NextResponse } from 'next/server'
import { checkXiaohongshuLogin } from '@/lib/services/xiaohongshu-mcp.service'

export async function GET() {
  try {
    const payload = await checkXiaohongshuLogin()
    return NextResponse.json({ success: true, data: payload.data ?? payload })
  } catch (error) {
    const message = error instanceof Error && error.message === 'fetch failed'
      ? '小红书 MCP 服务未启动，请先启动本机 MCP 服务（默认端口 18060）'
      : error instanceof Error ? error.message : '小红书 MCP 服务不可用'
    return NextResponse.json(
      { success: false, error: message },
      { status: 502 },
    )
  }
}
