import { NextRequest, NextResponse } from 'next/server'
import { comprehensiveAnalysisWorkflow } from '@/lib/workflow/workflows/comprehensive-analysis'

/**
 * POST /api/analysis/comprehensive/[runId]/execute
 * 执行工作流
 * Query: mode=all|next|resume&stepName=xxx
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ runId: string }> }
) {
  try {
    const { runId } = await params
    const mode = request.nextUrl.searchParams.get('mode') || 'all'
    const stepName = request.nextUrl.searchParams.get('stepName')

    if (mode === 'all') {
      // 执行完整工作流
      await comprehensiveAnalysisWorkflow.executeAll(runId)
      return NextResponse.json({ success: true, completed: true })
    }

    if (mode === 'next') {
      // 执行下一步
      const result = await comprehensiveAnalysisWorkflow.executeNext(runId)
      return NextResponse.json({ success: true, ...result })
    }

    if (mode === 'resume') {
      // 断点续执行
      await comprehensiveAnalysisWorkflow.resume(runId)
      return NextResponse.json({ success: true, completed: true })
    }

    if (mode === 'step' && stepName) {
      // 执行指定步骤
      await comprehensiveAnalysisWorkflow.executeStep(runId, stepName)
      return NextResponse.json({ success: true })
    }

    return NextResponse.json(
      { error: 'Invalid mode or missing stepName' },
      { status: 400 }
    )
  } catch (error) {
    console.error('Failed to execute workflow:', error)
    return NextResponse.json({ error: String(error) }, { status: 500 })
  }
}
