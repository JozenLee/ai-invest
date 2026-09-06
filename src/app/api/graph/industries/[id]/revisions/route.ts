import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params
    const includeSnapshot = request.nextUrl.searchParams.get('includeSnapshot') === 'true'
    const revisions = await prisma.graphRevision.findMany({
      where: { industryId: id },
      orderBy: { version: 'desc' },
      take: Math.min(100, Math.max(1, Number(request.nextUrl.searchParams.get('limit')) || 20)),
      select: {
        id: true,
        industryId: true,
        industryCode: true,
        industryName: true,
        version: true,
        parentRevisionId: true,
        contentHash: true,
        evidenceJson: true,
        status: true,
        reviewedBy: true,
        createdAt: true,
        ...(includeSnapshot ? { snapshotJson: true } : {}),
      },
    })
    return NextResponse.json({ success: true, data: revisions.map(revision => ({
      ...revision,
      evidence: revision.evidenceJson ? JSON.parse(revision.evidenceJson) : [],
      evidenceJson: undefined,
      ...('snapshotJson' in revision ? { snapshot: JSON.parse(String(revision.snapshotJson)) } : {}),
      snapshotJson: undefined,
    })) })
  } catch (error) {
    return NextResponse.json({ success: false, error: error instanceof Error ? error.message : '读取图谱版本失败' }, { status: 500 })
  }
}
