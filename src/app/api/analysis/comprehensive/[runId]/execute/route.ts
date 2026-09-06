import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { dispatchAnalysis } from '@/lib/workflow/background-runner'
import { sameOriginRequest } from '@/lib/security/request-origin'

export async function POST(request: NextRequest, { params }: { params: Promise<{ runId: string }> }) {
  if(!sameOriginRequest(request))return NextResponse.json({error:'不接受跨站执行分析'},{status:403})
  const { runId } = await params
  const mode = request.nextUrl.searchParams.get('mode') || 'all'
  const stepName = request.nextUrl.searchParams.get('stepName')
  if (!['all', 'next', 'resume', 'step'].includes(mode) || (mode === 'step' && !stepName)) return NextResponse.json({ error: '无效执行模式' }, { status: 400 })
  const run = await prisma.executionRun.findUnique({ where: { id: runId }, include: { steps: { select: { stepName: true } } } })
  if (!run) return NextResponse.json({ error: '分析轮次不存在' }, { status: 404 })
  if (stepName && !run.steps.some(step => step.stepName === stepName)) return NextResponse.json({ error: '步骤不存在' }, { status: 400 })
  if (run.status === 'COMPLETED') return NextResponse.json({ success: true, completed: true })
  try {
    const result = await dispatchAnalysis(runId, mode, stepName)
    return NextResponse.json({ success: true, accepted: true, ...result }, { status: 202 })
  } catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : '后台派发失败' }, { status: 503 }) }
}
