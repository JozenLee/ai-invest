import { NextResponse } from 'next/server';

const PYTHON_API_URL = process.env.PYTHON_API_URL || 'http://localhost:8000';

/**
 * POST /api/ai/investment-ideas - 从大V内容中提取投资理念
 */
export async function POST(request: Request) {
  try {
    const body = await request.json();

    const response = await fetch(`${PYTHON_API_URL}/api/ai/investment-ideas`, {
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
          error: error.detail || 'Investment ideas extraction failed',
        },
        { status: response.status }
      );
    }

    const data = await response.json();
    return NextResponse.json(data);
  } catch (error) {
    console.error('Error in investment ideas extraction:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Investment ideas extraction failed',
      },
      { status: 500 }
    );
  }
}
