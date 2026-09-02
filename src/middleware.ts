import { NextRequest, NextResponse } from 'next/server'

export function middleware(request: NextRequest) {
  const start = Date.now()
  const { pathname } = request.nextUrl

  if (request.nextUrl.hostname === '127.0.0.1') {
    const canonicalUrl = request.nextUrl.clone()
    canonicalUrl.hostname = 'localhost'
    return NextResponse.redirect(canonicalUrl, 307)
  }

  // 只记录API请求
  if (pathname.startsWith('/api/')) {
    console.log(`[${new Date().toISOString()}] → ${request.method} ${pathname}`)
    console.log(`  来源IP: ${request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip') || 'unknown'}`)
    console.log(`  User-Agent: ${request.headers.get('user-agent')?.substring(0, 50)}...`)

    // 创建响应并记录
    const response = NextResponse.next()

    // 记录完成时间
    const duration = Date.now() - start
    console.log(`[${new Date().toISOString()}] ← ${pathname} 完成 (${duration}ms)`)

    return response
  }

  return NextResponse.next()
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
}
