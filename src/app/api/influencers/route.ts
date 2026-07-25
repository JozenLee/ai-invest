import { NextRequest, NextResponse } from 'next/server';

const FASTAPI_URL = process.env.FASTAPI_URL || process.env.DATA_SERVICE_URL || 'http://localhost:8000';

/**
 * GET /api/influencers
 * 获取大V列表（代理到FastAPI）
 * Query参数: platform, page, pageSize
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const platform = searchParams.get('platform');
    const page = searchParams.get('page') || '1';
    const pageSize = searchParams.get('pageSize') || '20';

    const queryString = new URLSearchParams({
      page,
      pageSize,
      ...(platform && { platform })
    }).toString();

    const response = await fetch(`${FASTAPI_URL}/api/influencers?${queryString}`);

    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: 'Failed to fetch influencers' }));
      return NextResponse.json(
        { error: error.error || 'Failed to fetch influencers', details: error },
        { status: response.status }
      );
    }

    const data = await response.json();
    return NextResponse.json(data);
  } catch (error) {
    console.error('Error fetching influencers:', error);
    return NextResponse.json(
      { error: 'Failed to fetch influencers', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/influencers
 * 创建influencer（代理到FastAPI）
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    const response = await fetch(`${FASTAPI_URL}/api/influencers`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: 'Failed to create influencer' }));
      return NextResponse.json(error, { status: response.status });
    }

    const data = await response.json();
    return NextResponse.json(data);
  } catch (error) {
    console.error('Error creating influencer:', error);
    return NextResponse.json(
      { error: 'Failed to create influencer', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
