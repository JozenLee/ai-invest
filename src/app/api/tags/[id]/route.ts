import { NextRequest, NextResponse } from 'next/server'
import { tagService } from '@/lib/services/tag.service'

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const tag = await tagService.getTagById(params.id)

    if (!tag) {
      return NextResponse.json(
        {
          success: false,
          error: 'Tag not found'
        },
        { status: 404 }
      )
    }

    return NextResponse.json({
      success: true,
      data: tag
    })

  } catch (error) {
    console.error('Failed to get tag:', error)
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to get tag'
      },
      { status: 500 }
    )
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const body = await request.json()

    const tag = await tagService.updateTag(params.id, {
      name: body.name,
      description: body.description,
      keywords: body.keywords,
      isActive: body.isActive,
      sortOrder: body.sortOrder
    })

    return NextResponse.json({
      success: true,
      data: tag
    })

  } catch (error) {
    console.error('Failed to update tag:', error)
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to update tag'
      },
      { status: 400 }
    )
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    await tagService.deleteTag(params.id)

    return NextResponse.json({
      success: true
    })

  } catch (error) {
    console.error('Failed to delete tag:', error)
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to delete tag'
      },
      { status: 400 }
    )
  }
}
