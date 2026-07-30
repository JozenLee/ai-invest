import { NextResponse } from 'next/server'
import { ETFGraphAnalyzerService } from '@/lib/services/etf-graph-analyzer.service'

export async function GET(
  request: Request,
  { params }: { params: Promise<{ ticker: string }> }
) {
  try {
    const { ticker } = await params

    if (!ticker) {
      return NextResponse.json(
        { success: false, error: '缺少ETF代码' },
        { status: 400 }
      )
    }

    const analyzer = new ETFGraphAnalyzerService()
    const analysis = await analyzer.analyze(ticker)

    return NextResponse.json({
      success: true,
      data: analysis
    })
  } catch (error) {
    console.error('ETF图谱分析失败:', error)
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'ETF图谱分析失败'
      },
      { status: 500 }
    )
  }
}
