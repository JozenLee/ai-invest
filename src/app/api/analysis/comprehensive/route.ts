import { NextRequest, NextResponse } from 'next/server'
import { comprehensiveAnalysisWorkflow } from '@/lib/workflow/workflows/comprehensive-analysis'
import { reviewBaseline } from '@/lib/workflow/run-lineage'
import { getResearchProfile } from '@/lib/research/store'
import { sameOriginRequest } from '@/lib/security/request-origin'

/**
 * POST /api/analysis/comprehensive
 * 创建新的执行轮次
 */
export async function POST(request: NextRequest) {
  if(!sameOriginRequest(request))return NextResponse.json({error:'不接受跨站启动分析'},{status:403})
  try {
    const body = await request.json()
    const { industryId, companySource = 'etf' } = body

    if (!industryId) {
      return NextResponse.json(
        { error: 'Missing required parameter: industryId' },
        { status: 400 }
      )
    }

    await getResearchProfile(industryId)
    const lineage = await reviewBaseline(industryId, body.parentRunId)
    const runId = await comprehensiveAnalysisWorkflow.createRun({
      industryId,
      ...lineage,
      kind: lineage.parentRunId ? 'review' : 'analysis',
      rulesOnly: body.rulesOnly === true,
      publicOnly: body.publicOnly !== false || body.portfolioAiConsent !== new URL(process.env.ANTHROPIC_BASE_URL || 'https://api.anthropic.com').origin,
      companySource: companySource === 'graph' ? 'graph' : 'etf',
      portfolioAiConsent: body.portfolioAiConsent === new URL(process.env.ANTHROPIC_BASE_URL || 'https://api.anthropic.com').origin ? body.portfolioAiConsent : null,
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
    const limit = Math.min(100, Math.max(1, Number(request.nextUrl.searchParams.get('limit')) || 50))

    const runs = await comprehensiveAnalysisWorkflow.listRuns(limit, request.nextUrl.searchParams.get('industryId') || undefined)

    return NextResponse.json(runs)
  } catch (error) {
    console.error('Failed to list execution runs:', error)
    return NextResponse.json(
      { error: String(error) },
      { status: 500 }
    )
  }
}
