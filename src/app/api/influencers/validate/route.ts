import { NextRequest, NextResponse } from 'next/server';

const FASTAPI_URL = process.env.FASTAPI_URL || process.env.DATA_SERVICE_URL || 'http://localhost:8000';

/**
 * POST /api/influencers/validate
 * 验证平台账号（代理到FastAPI）
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    const response = await fetch(`${FASTAPI_URL}/api/influencers/validate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });

    const data = await response.json();

    if (!response.ok) {
      return NextResponse.json(data, { status: response.status });
    }

    return NextResponse.json(data);
  } catch (error) {
    console.error('Error validating influencer:', error);
    return NextResponse.json(
      { error: 'Failed to validate influencer', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
