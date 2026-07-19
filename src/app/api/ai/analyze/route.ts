import { NextResponse } from 'next/server';

const PYTHON_API_URL = process.env.PYTHON_API_URL || 'http://localhost:8000';

/**
 * POST /api/ai/analyze - 分析单篇新闻事件
 */
export async function POST(request: Request) {
  try {
    const body = await request.json();

    const response = await fetch(`${PYTHON_API_URL}/api/ai/analyze`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const error = await response.json();
      return NextResponse.json(
        {
          success: false,
          error: error.detail || 'AI analysis failed',
        },
        { status: response.status }
      );
    }

    const data = await response.json();
    return NextResponse.json(data);
  } catch (error) {
    console.error('Error in AI analysis:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'AI analysis failed',
      },
      { status: 500 }
    );
  }
}
