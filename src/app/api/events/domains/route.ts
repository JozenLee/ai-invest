import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db/prisma';

/**
 * GET /api/events/domains
 * 获取所有领域列表
 */
export async function GET(request: NextRequest) {
  try {
    const domains = await prisma.domain.findMany({
      orderBy: [
        { name: 'asc' },
      ],
      include: {
        _count: {
          select: {
            articles: true,
          },
        },
      },
    });

    const formattedDomains = domains.map(domain => ({
      id: domain.id,
      name: domain.name,
      code: domain.code,
      description: domain.description,
      keywords: domain.keywords ? JSON.parse(domain.keywords) : [],
      isActive: domain.isActive,
      articleCount: domain._count.articles,
      createdAt: domain.createdAt.toISOString(),
    }));

    return NextResponse.json({
      success: true,
      data: formattedDomains,
    });
  } catch (error) {
    console.error('Error fetching domains:', error);
    return NextResponse.json(
      {
        success: false,
        error: 'Failed to fetch domains',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
