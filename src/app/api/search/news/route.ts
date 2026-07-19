import { NextRequest, NextResponse } from 'next/server';

const PYTHON_API_URL = process.env.PYTHON_API_URL || 'http://localhost:8000';

/**
 * GET /api/search/news - 全文搜索新闻
 */
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const q = searchParams.get('q');
    const limit = searchParams.get('limit') || '20';
    const offset = searchParams.get('offset') || '0';
    const category = searchParams.get('category');
    const sentiment = searchParams.get('sentiment');

    if (!q) {
      return NextResponse.json(
        {
          success: false,
          error: '搜索关键词不能为空',
        },
        { status: 400 }
      );
    }

    // 构建查询参数
    const params = new URLSearchParams({
      q,
      limit,
      offset,
    });

    if (category) params.append('category', category);
    if (sentiment) params.append('sentiment', sentiment);

    const response = await fetch(
      `${PYTHON_API_URL}/api/search/news?${params.toString()}`,
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
          error: error.detail || 'Search failed',
        },
        { status: response.status }
      );
    }

    const data = await response.json();
    return NextResponse.json(data);
  } catch (error) {
    console.error('Error in search:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Search failed',
      },
      { status: 500 }
    );
  }
}
