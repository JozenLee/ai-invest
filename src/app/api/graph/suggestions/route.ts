import { NextRequest, NextResponse } from 'next/server'
import { graphSuggestionService } from '@/lib/services/graph-suggestion.service'

/**
 * GET /api/graph/suggestions
 * Query params: status, source, type, minConfidence, limit
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)

    const filters = {
      status: searchParams.get('status') || undefined,
      source: searchParams.get('source') || undefined,
      type: searchParams.get('type') || undefined,
      minConfidence: searchParams.get('minConfidence')
        ? parseFloat(searchParams.get('minConfidence')!)
        : undefined,
      limit: searchParams.get('limit')
        ? parseInt(searchParams.get('limit')!)
        : 100
    }

    const suggestions = await graphSuggestionService.getSuggestions(filters)

    return NextResponse.json({
      success: true,
      data: {
        suggestions,
        total: suggestions.length
      }
    })
  } catch (error) {
    console.error('Get suggestions error:', error)
    return NextResponse.json(
      { success: false, error: String(error) },
      { status: 500 }
    )
  }
}

/**
 * POST /api/graph/suggestions/batch
 * Body: { action: 'approve' | 'reject', suggestionIds: string[], reviewedBy: string, note?: string }
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()

    if (!body.action || !['approve', 'reject'].includes(body.action)) {
      return NextResponse.json(
        { success: false, error: 'action必须是approve或reject' },
        { status: 400 }
      )
    }

    if (!Array.isArray(body.suggestionIds) || body.suggestionIds.length === 0) {
      return NextResponse.json(
        { success: false, error: 'suggestionIds必须是非空数组' },
        { status: 400 }
      )
    }

    if (!body.reviewedBy) {
      return NextResponse.json(
        { success: false, error: 'reviewedBy必填' },
        { status: 400 }
      )
    }

    if (body.action === 'approve') {
      const count = await graphSuggestionService.batchApprove(
        body.suggestionIds,
        body.reviewedBy
      )

      return NextResponse.json({
        success: true,
        data: {
          approvedCount: count,
          total: body.suggestionIds.length
        }
      })
    } else {
      // Batch reject
      let count = 0
      for (const id of body.suggestionIds) {
        try {
          await graphSuggestionService.rejectSuggestion(
            id,
            body.reviewedBy,
            body.note
          )
          count++
        } catch (error) {
          console.error(`Failed to reject suggestion ${id}:`, error)
        }
      }

      return NextResponse.json({
        success: true,
        data: {
          rejectedCount: count,
          total: body.suggestionIds.length
        }
      })
    }
  } catch (error) {
    console.error('Batch review error:', error)
    return NextResponse.json(
      { success: false, error: String(error) },
      { status: 500 }
    )
  }
}
