import { NextRequest, NextResponse } from 'next/server';

const PYTHON_API_URL = process.env.PYTHON_API_URL || 'http://localhost:8000';

/**
 * GET /api/search/suggest - 搜索建议（自动补全）
 */
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const q = searchParams.get('q');
    const limit = searchParams.get('limit') || '10';

    if (!q) {
      return NextResponse.json(
        {
          success: false,
          error: '搜索关键词不能为空',
        },
        { status: 400 }
      );
    }

    const response = await fetch(
      `${PYTHON_API_URL}/api/search/suggest?q=${encodeURIComponent(q)}&limit=${limit}`,
      {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
      }
    );

    if (!response.ok) {
      const error = await response.json();
      return NextResponse.json(
        {
          success: false,
          error: error.detail || 'Suggest failed',
        },
        { status: response.status }
      );
    }

    const data = await response.json();
    return NextResponse.json(data);
  } catch (error) {
    console.error('Error in search suggest:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Suggest failed',
      },
      { status: 500 }
    );
  }
}
