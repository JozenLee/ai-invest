import { NextRequest, NextResponse } from 'next/server';

const DATA_SERVICE_URL = process.env.DATA_SERVICE_URL || 'http://localhost:8000';

/**
 * GET /api/graph/industries/{id}/segments
 * 获取某个产业的所有Segment列表（用于前端筛选器）
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: industryId } = await params;

  try {
    // 调用Python数据服务
    const response = await fetch(
      `${DATA_SERVICE_URL}/api/v1/industry-graph/${industryId}/segments`,
      {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
      }
    );

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ detail: 'Unknown error' }));
      return NextResponse.json(
        {
          success: false,
          error: errorData.detail || `HTTP ${response.status}`,
        },
        { status: response.status }
      );
    }

    const data = await response.json();

    return NextResponse.json({
      success: true,
      data: data.data,
    });
  } catch (error) {
    console.error('获取Segment列表失败:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
