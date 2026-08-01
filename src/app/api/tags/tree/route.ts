import { NextResponse } from 'next/server'
import { tagService } from '@/lib/services/tag.service'

export async function GET() {
  try {
    const tree = await tagService.getTagTree()

    return NextResponse.json({
      success: true,
      data: tree
    })

  } catch (error) {
    console.error('Failed to get tag tree:', error)
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to get tag tree'
      },
      { status: 500 }
    )
  }
}
