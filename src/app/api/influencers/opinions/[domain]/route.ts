import { NextRequest, NextResponse } from 'next/server';

const FASTAPI_URL = process.env.FASTAPI_URL || process.env.DATA_SERVICE_URL || 'http://localhost:8000';

/**
 * GET /api/influencers/opinions/[domain]
 * 获取领域聚合观点（代理到FastAPI）
 * Query参数: timeWindow (3d|7d|30d, default: 7d)
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ domain: string }> }
) {
  try {
    const { domain } = await params;
    const { searchParams } = new URL(request.url);
    const timeWindow = searchParams.get('timeWindow') || '7d';

    const response = await fetch(
      `${FASTAPI_URL}/api/influencers/opinions/domain/${domain}?time_window=${timeWindow}`
    );

    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: 'Failed to fetch opinions' }));
      return NextResponse.json(
        { error: error.error || 'Failed to fetch opinions', details: error },
        { status: response.status }
      );
    }

    const data = await response.json();
    return NextResponse.json(data);
  } catch (error) {
    console.error('Error fetching domain opinions:', error);
    return NextResponse.json(
      { error: 'Failed to fetch opinions', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
