import { NextRequest, NextResponse } from 'next/server'
import { claudeClient } from '@/lib/ai/claude'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { title, content, source, publishTime } = body

    if (!title) {
      return NextResponse.json(
        { success: false, error: '标题不能为空' },
        { status: 400 }
      )
    }

    const analysis = await claudeClient.analyzeEvent({
      title,
      content: content || '',
      source: source || '未知',
      publishTime: publishTime || new Date().toISOString()
    })

    return NextResponse.json({
      success: true,
      data: analysis
    })
  } catch (error) {
    console.error('事件分析失败:', error)
    return NextResponse.json({
      success: false,
      error: '事件分析失败，Claude API 可能未配置或不可用',
      data: null,
    })
  }
}
