import { NextResponse } from 'next/server'
import { ETFGraphMapperService } from '@/lib/services/etf-graph-mapper.service'

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

    const mapper = new ETFGraphMapperService()
    const exposures = await mapper.mapETFToGraph(ticker)

    const totalExposure = exposures.reduce((sum, e) => sum + e.exposure, 0)

    return NextResponse.json({
      success: true,
      data: {
        ticker,
        nodeExposures: exposures,
        coverage: exposures.length,
        totalExposure: Math.round(totalExposure * 10000) / 10000
      }
    })
  } catch (error) {
    console.error('ETF持仓映射失败:', error)
    return NextResponse.json(
      { success: false, error: 'ETF持仓映射失败' },
      { status: 500 }
    )
  }
}
