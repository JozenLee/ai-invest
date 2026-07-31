import { NextRequest, NextResponse } from 'next/server'
import { scoreUpdater } from '@/lib/services/score-updater.service'
import { ScoreTrigger } from '@/types/scoring'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { nodeIds, trigger } = body as {
      nodeIds: string[]
      trigger: ScoreTrigger
    }

    if (!nodeIds || !Array.isArray(nodeIds) || nodeIds.length === 0) {
      return NextResponse.json(
        { error: 'nodeIds array is required' },
        { status: 400 }
      )
    }

    if (!trigger || !['news', 'market', 'structure', 'manual'].includes(trigger)) {
      return NextResponse.json(
        { error: 'Invalid trigger type' },
        { status: 400 }
      )
    }

    // Trigger batch update (async)
    await scoreUpdater.batchUpdateScores(nodeIds, trigger)

    return NextResponse.json({
      success: true,
      updatedCount: nodeIds.length,
      trigger,
    })
  } catch (error) {
    console.error('Error updating scores:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
