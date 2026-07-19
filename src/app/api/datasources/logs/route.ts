import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db/prisma';

/**
 * GET /api/datasources/logs
 * 获取采集日志列表
 *
 * Query参数:
 * - sourceId: 数据源ID过滤（可选）
 * - status: 状态过滤 success/failed/running（可选）
 * - limit: 限制数量，默认50
 * - offset: 偏移量，默认0
 */
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const sourceId = searchParams.get('sourceId');
    const status = searchParams.get('status');
    const limit = Math.min(parseInt(searchParams.get('limit') || '50'), 100);
    const offset = parseInt(searchParams.get('offset') || '0');

    // 构建查询条件
    const where: any = {};
    if (sourceId) {
      where.sourceId = sourceId;
    }
    if (status) {
      where.status = status;
    }

    // 查询总数
    const total = await prisma.dataSourceLog.count({ where });

    // 查询日志列表
    const logs = await prisma.dataSourceLog.findMany({
      where,
      include: {
        source: {
          select: {
            name: true,
          },
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
      take: limit,
      skip: offset,
    });

    // 格式化响应
    const items = logs.map(log => ({
      id: log.id,
      sourceId: log.sourceId,
      sourceName: log.source.name,
      status: log.status,
      message: log.message || '',
      fetchedCount: log.fetchedCount || 0,
      processedCount: log.processedCount || 0,
      failedCount: log.failedCount || 0,
      duration: log.duration || 0,
      error: log.errorDetail,
      createdAt: log.createdAt.toISOString(),
    }));

    return NextResponse.json({
      success: true,
      data: {
        total,
        items,
        limit,
        offset,
      },
    });
  } catch (error) {
    console.error('Error fetching datasource logs:', error);
    return NextResponse.json(
      {
        success: false,
        error: 'Failed to fetch logs',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
