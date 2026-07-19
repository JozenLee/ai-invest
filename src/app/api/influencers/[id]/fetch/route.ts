import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db/prisma';

/**
 * POST /api/influencers/[id]/fetch
 * 手动触发大V动态采集
 */
export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    // 获取大V信息
    const influencer = await prisma.influencer.findUnique({
      where: {
        id: params.id,
      },
    });

    if (!influencer) {
      return NextResponse.json(
        {
          success: false,
          error: 'Influencer not found',
        },
        { status: 404 }
      );
    }

    // 调用 Python 数据服务触发采集
    const DATA_SERVICE_URL = process.env.DATA_SERVICE_URL || 'http://localhost:8000';
    
    try {
      const response = await fetch(`${DATA_SERVICE_URL}/api/influencers/${params.id}/fetch`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          platform: influencer.platform,
          accountId: influencer.accountId,
        }),
      });

      if (!response.ok) {
        throw new Error(`Data service returned ${response.status}`);
      }

      const result = await response.json();

      return NextResponse.json({
        success: true,
        message: 'Fetch task triggered successfully',
        data: result,
      });
    } catch (fetchError) {
      console.error('Error calling data service:', fetchError);
      
      // 如果数据服务不可用，返回友好提示
      return NextResponse.json({
        success: false,
        error: 'Data service unavailable',
        message: 'Python data service is not running. Please start it with: cd data-service && python3 main.py',
      }, { status: 503 });
    }
  } catch (error) {
    console.error('Error triggering fetch:', error);
    return NextResponse.json(
      {
        success: false,
        error: 'Failed to trigger fetch',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
