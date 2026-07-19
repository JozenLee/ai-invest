import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db/prisma';

/**
 * GET /api/events/categories
 * 获取所有新闻分类（扁平列表）
 */
export async function GET(request: NextRequest) {
  try {
    const categories = await prisma.newsCategory.findMany({
      orderBy: [
        { parentId: 'asc' },
        { sortOrder: 'asc' },
        { name: 'asc' },
      ],
      include: {
        parent: {
          select: {
            id: true,
            name: true,
          },
        },
        _count: {
          select: {
            articles: true,
          },
        },
      },
    });

    const formattedCategories = categories.map(cat => ({
      id: cat.id,
      name: cat.name,
      code: cat.code,
      parentId: cat.parentId,
      parentName: cat.parent?.name,
      sortOrder: cat.sortOrder,
      isActive: cat.isActive,
      articleCount: cat._count.articles,
      createdAt: cat.createdAt.toISOString(),
    }));

    return NextResponse.json({
      success: true,
      data: formattedCategories,
    });
  } catch (error) {
    console.error('Error fetching categories:', error);
    return NextResponse.json(
      {
        success: false,
        error: 'Failed to fetch categories',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
