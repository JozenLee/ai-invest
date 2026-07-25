import { NextRequest, NextResponse } from 'next/server';

const FASTAPI_URL = process.env.FASTAPI_URL || process.env.DATA_SERVICE_URL || 'http://localhost:8000';

/**
 * POST /api/influencers/[id]/fetch
 * 手动触发大V动态采集（代理到FastAPI）
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    const response = await fetch(
      `${FASTAPI_URL}/api/influencers/${id}/fetch`,
      { method: 'POST' }
    );

    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: 'Failed to trigger fetch' }));
      return NextResponse.json(error, { status: response.status });
    }

    const data = await response.json();
    return NextResponse.json(data);
  } catch (error) {
    console.error('Error triggering fetch:', error);
    return NextResponse.json(
      { error: 'Failed to trigger fetch', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
