import { NextRequest, NextResponse } from 'next/server'
import { comprehensiveAnalysisWorkflow } from '@/lib/workflow/workflows/comprehensive-analysis'

/**
 * GET /api/analysis/comprehensive/[runId]
 * 获取执行详情
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ runId: string }> }
) {
  try {
    const { runId } = await params

    const run = await comprehensiveAnalysisWorkflow.getRunDetails(runId)

    if (!run) {
      return NextResponse.json({ error: 'Run not found' }, { status: 404 })
    }

    const parseJson = (value: string | null) => {
      if (!value) return null
      try { return JSON.parse(value) } catch { return value }
    }

    // 解析 JSON 字段
    const result = {
      ...run,
      metadata: parseJson(run.metadata),
      steps: run.steps.map((step) => ({
        ...step,
        progress: parseJson(step.progress),
        artifacts: step.artifacts.map((artifact) => ({
          ...artifact,
          data: parseJson(artifact.data)
        }))
      }))
    }

    return NextResponse.json(result)
  } catch (error) {
    console.error('Failed to get run details:', error)
    return NextResponse.json({ error: String(error) }, { status: 500 })
  }
}
