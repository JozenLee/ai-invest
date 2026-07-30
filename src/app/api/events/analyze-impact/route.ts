import { NextRequest, NextResponse } from 'next/server'
import { eventImpactAnalyzerService } from '@/lib/services/event-impact-analyzer.service'

/**
 * POST /api/events/analyze-impact
 * 分析事件对产业链的影响
 *
 * Body: {
 *   eventDescription: string
 *   sourceNodeIds: string[]
 *   impactDirection: 'positive' | 'negative'
 *   magnitude: number (1-5)
 *   maxDepth?: number (default: 4)
 * }
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()

    const {
      eventDescription,
      sourceNodeIds,
      impactDirection,
      magnitude = 5,
      maxDepth = 4
    } = body

    // 验证参数
    if (!eventDescription || typeof eventDescription !== 'string') {
      return NextResponse.json(
        { success: false, error: 'eventDescription必填且必须是字符串' },
        { status: 400 }
      )
    }

    if (!Array.isArray(sourceNodeIds) || sourceNodeIds.length === 0) {
      return NextResponse.json(
        { success: false, error: 'sourceNodeIds必须是非空数组' },
        { status: 400 }
      )
    }

    if (!['positive', 'negative'].includes(impactDirection)) {
      return NextResponse.json(
        { success: false, error: 'impactDirection必须是positive或negative' },
        { status: 400 }
      )
    }

    if (typeof magnitude !== 'number' || magnitude < 1 || magnitude > 5) {
      return NextResponse.json(
        { success: false, error: 'magnitude必须是1-5之间的数字' },
        { status: 400 }
      )
    }

    // 执行分析
    const result = await eventImpactAnalyzerService.analyzeEventImpact(
      eventDescription,
      sourceNodeIds,
      impactDirection,
      magnitude,
      maxDepth
    )

    return NextResponse.json({
      success: true,
      data: result
    })
  } catch (error) {
    console.error('Analyze event impact error:', error)
    return NextResponse.json(
      { success: false, error: String(error) },
      { status: 500 }
    )
  }
}
