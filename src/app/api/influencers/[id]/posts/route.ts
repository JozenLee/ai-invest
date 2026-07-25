import { NextRequest, NextResponse } from 'next/server';

const FASTAPI_URL = process.env.FASTAPI_URL || process.env.DATA_SERVICE_URL || 'http://localhost:8000';

/**
 * GET /api/influencers/[id]/posts
 * 获取influencer的帖子列表（代理到FastAPI）
 * Query参数: page, pageSize, aiProcessed
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const { searchParams } = new URL(request.url);
    const page = searchParams.get('page') || '1';
    const pageSize = searchParams.get('pageSize') || '20';
    const aiProcessed = searchParams.get('aiProcessed');

    const queryString = new URLSearchParams({
      page,
      pageSize,
      ...(aiProcessed && { aiProcessed })
    }).toString();

    const response = await fetch(
      `${FASTAPI_URL}/api/influencers/${id}/posts?${queryString}`
    );

    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: 'Failed to fetch posts' }));
      return NextResponse.json(
        { error: error.error || 'Failed to fetch posts', details: error },
        { status: response.status }
      );
    }

    const data = await response.json();
    return NextResponse.json(data);
  } catch (error) {
    console.error('Error fetching influencer posts:', error);
    return NextResponse.json(
      { error: 'Failed to fetch posts', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
