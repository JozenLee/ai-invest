import { NextResponse } from 'next/server'

const DATA_SERVICE_URL = process.env.DATA_SERVICE_URL || 'http://localhost:8000'

async function handleRequest(method: 'GET' | 'POST') {
  try {
    const response = await fetch(`${DATA_SERVICE_URL}/api/scheduler/toggle`, {
      method,
      signal: AbortSignal.timeout(5000),
    })

    if (response.ok) {
      const result = await response.json()
      return NextResponse.json(result)
    }

    return NextResponse.json({
      status: 'offline',
      message: '调度服务暂时不可用',
    })
  } catch (error) {
    console.error('调度服务不可用:', error)

    return NextResponse.json({
      status: 'offline',
      message: '调度服务暂时不可用',
    })
  }
}

export async function GET() {
  return handleRequest('GET')
}

export async function POST() {
  return handleRequest('POST')
}
