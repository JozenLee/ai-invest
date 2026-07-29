import { NextRequest, NextResponse } from 'next/server'
import { graphSuggestionService } from '@/lib/services/graph-suggestion.service'

/**
 * PATCH /api/graph/suggestions/[id]
 * Body: { action: 'approve' | 'reject', reviewedBy: string, note?: string }
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const body = await request.json()

    if (!body.action || !['approve', 'reject'].includes(body.action)) {
      return NextResponse.json(
        { success: false, error: 'action必须是approve或reject' },
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
      await graphSuggestionService.approveSuggestion(params.id, body.reviewedBy)
    } else {
      await graphSuggestionService.rejectSuggestion(
        params.id,
        body.reviewedBy,
        body.note
      )
    }

    return NextResponse.json({
      success: true,
      data: { id: params.id, action: body.action }
    })
  } catch (error) {
    console.error('Review suggestion error:', error)
    return NextResponse.json(
      { success: false, error: String(error) },
      { status: 500 }
    )
  }
}
