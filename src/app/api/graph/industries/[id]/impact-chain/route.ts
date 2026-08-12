import { NextRequest, NextResponse } from 'next/server';

const DATA_SERVICE_URL = process.env.DATA_SERVICE_URL || 'http://localhost:8000';

/**
 * GET /api/graph/industries/{id}/impact-chain
 * 获取影响链路（图遍历）
 *
 * Query Parameters:
 *   segment: Segment代码
 *   max_depth: 最大遍历深度（默认3）
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: industryId } = await params;
  const { searchParams } = new URL(request.url);
  const segmentCode = searchParams.get('segment');
  const maxDepth = searchParams.get('max_depth') || '3';

  if (!segmentCode) {
    return NextResponse.json(
      {
        success: false,
        error: 'segment参数不能为空',
      },
      { status: 400 }
    );
  }

  try {
    // 构建查询参数
    const queryParams = new URLSearchParams({
      segment: segmentCode,
      max_depth: maxDepth,
    });

    // 调用Python数据服务
    const response = await fetch(
      `${DATA_SERVICE_URL}/api/v1/industry-graph/${industryId}/impact-chain?${queryParams}`,
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
    console.error('获取影响链路失败:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
