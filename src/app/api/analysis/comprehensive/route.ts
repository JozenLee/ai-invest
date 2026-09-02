import { NextRequest, NextResponse } from 'next/server'
import { comprehensiveAnalysisWorkflow } from '@/lib/workflow/workflows/comprehensive-analysis'

/**
 * POST /api/analysis/comprehensive
 * 创建新的执行轮次
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { industryId, companySource = 'etf' } = body

    if (!industryId) {
      return NextResponse.json(
        { error: 'Missing required parameter: industryId' },
        { status: 400 }
      )
    }

    const runId = await comprehensiveAnalysisWorkflow.createRun({
      industryId,
      companySource: companySource === 'graph' ? 'graph' : 'etf',
      createdBy: 'user', // TODO: 从session获取用户信息
      timestamp: new Date().toISOString()
    })

    return NextResponse.json({ runId })
  } catch (error) {
    console.error('Failed to create execution run:', error)
    return NextResponse.json(
      { error: String(error) },
      { status: 500 }
    )
  }
}

/**
 * GET /api/analysis/comprehensive
 * 获取执行轮次列表
 */
export async function GET(request: NextRequest) {
  try {
    const limit = Number(request.nextUrl.searchParams.get('limit')) || 50

    const runs = await comprehensiveAnalysisWorkflow.listRuns(limit)

    return NextResponse.json(runs)
  } catch (error) {
    console.error('Failed to list execution runs:', error)
    return NextResponse.json(
      { error: String(error) },
      { status: 500 }
    )
  }
}
