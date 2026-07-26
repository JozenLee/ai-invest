import { NextRequest, NextResponse } from 'next/server';

const FASTAPI_URL = process.env.FASTAPI_URL || process.env.DATA_SERVICE_URL || 'http://localhost:8000';

/**
 * GET /api/influencers/[id]
 * 获取influencer详情（代理到FastAPI）
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const response = await fetch(`${FASTAPI_URL}/api/influencers/${id}`);

    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: 'Influencer not found' }));
      return NextResponse.json(
        { error: error.error || 'Influencer not found', details: error },
        { status: response.status }
      );
    }

    const data = await response.json();
    return NextResponse.json(data);
  } catch (error) {
    console.error('Error fetching influencer:', error);
    return NextResponse.json(
      { error: 'Failed to fetch influencer', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}

/**
 * PUT /api/influencers/[id]
 * 更新influencer（代理到FastAPI）
 */
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();

    const response = await fetch(`${FASTAPI_URL}/api/influencers/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: 'Failed to update influencer' }));
      return NextResponse.json(error, { status: response.status });
    }

    const data = await response.json();
    return NextResponse.json(data);
  } catch (error) {
    console.error('Error updating influencer:', error);
    return NextResponse.json(
      { error: 'Failed to update influencer', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/influencers/[id]
 * 删除influencer（代理到FastAPI）
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    const response = await fetch(`${FASTAPI_URL}/api/influencers/${id}`, {
      method: 'DELETE',
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: 'Failed to delete influencer' }));
      return NextResponse.json(error, { status: response.status });
    }

    const data = await response.json();
    return NextResponse.json(data);
  } catch (error) {
    console.error('Error deleting influencer:', error);
    return NextResponse.json(
      { error: 'Failed to delete influencer', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
