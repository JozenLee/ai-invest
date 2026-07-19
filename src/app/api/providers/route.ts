import { NextResponse } from 'next/server';

const PYTHON_API_URL = process.env.PYTHON_API_URL || 'http://localhost:8000';

/**
 * GET /api/providers - 获取所有可用的 Provider 列表
 */
export async function GET() {
  try {
    const response = await fetch(`${PYTHON_API_URL}/api/providers/list`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      throw new Error(`Python API error: ${response.statusText}`);
    }

    const data = await response.json();
    return NextResponse.json(data);
  } catch (error) {
    console.error('Error fetching providers:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to fetch providers',
      },
      { status: 500 }
    );
  }
}
