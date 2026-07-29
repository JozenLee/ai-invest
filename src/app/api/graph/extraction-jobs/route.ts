// src/app/api/graph/extraction-jobs/route.ts
import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/lib/db/prisma'

/**
 * GET /api/graph/extraction-jobs
 * Query params: status, sourceType, limit
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)

    const where: any = {}
    if (searchParams.get('status')) {
      where.status = searchParams.get('status')
    }
    if (searchParams.get('sourceType')) {
      where.sourceType = searchParams.get('sourceType')
    }

    const limit = searchParams.get('limit')
      ? parseInt(searchParams.get('limit')!)
      : 50

    // Get jobs
    const jobs = await prisma.graphExtractionJob.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: limit
    })

    // Get statistics
    const stats = await prisma.graphExtractionJob.groupBy({
      by: ['status'],
      _count: true
    })

    const statsMap = {
      total: jobs.length,
      pending: 0,
      processing: 0,
      completed: 0,
      failed: 0
    }

    stats.forEach((stat) => {
      if (stat.status in statsMap) {
        statsMap[stat.status as keyof typeof statsMap] = stat._count
      }
    })

    return NextResponse.json({
      success: true,
      data: {
        jobs,
        stats: statsMap
      }
    })
  } catch (error) {
    console.error('Get extraction jobs error:', error)
    return NextResponse.json(
      { success: false, error: String(error) },
      { status: 500 }
    )
  }
}
