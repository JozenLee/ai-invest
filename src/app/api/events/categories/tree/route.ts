import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db/prisma';

interface CategoryNode {
  id: string;
  name: string;
  code: string;
  parentId: string | null;
  sortOrder: number;
  isActive: boolean;
  articleCount: number;
  children: CategoryNode[];
}

/**
 * GET /api/events/categories/tree
 * 获取分类树形结构
 */
export async function GET(request: NextRequest) {
  try {
    const categories = await prisma.newsCategory.findMany({
      where: {
        isActive: true,
      },
      orderBy: [
        { sortOrder: 'asc' },
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

    // 构建树形结构
    const categoryMap = new Map<string, CategoryNode>();
    const rootCategories: CategoryNode[] = [];

    // 第一遍：创建所有节点
    categories.forEach(cat => {
      const node: CategoryNode = {
        id: cat.id,
        name: cat.name,
        code: cat.code,
        parentId: cat.parentId,
        sortOrder: cat.sortOrder,
        isActive: cat.isActive,
        articleCount: cat._count.articles,
        children: [],
      };
      categoryMap.set(cat.id, node);
    });

    // 第二遍：建立父子关系
    categoryMap.forEach(node => {
      if (node.parentId) {
        const parent = categoryMap.get(node.parentId);
        if (parent) {
          parent.children.push(node);
        } else {
          // 父节点不存在或不活跃，当作根节点
          rootCategories.push(node);
        }
      } else {
        rootCategories.push(node);
      }
    });

    // 递归排序子节点
    const sortChildren = (nodes: CategoryNode[]) => {
      nodes.sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name));
      nodes.forEach(node => {
        if (node.children.length > 0) {
          sortChildren(node.children);
        }
      });
    };

    sortChildren(rootCategories);

    return NextResponse.json({
      success: true,
      data: rootCategories,
    });
  } catch (error) {
    console.error('Error fetching category tree:', error);
    return NextResponse.json(
      {
        success: false,
        error: 'Failed to fetch category tree',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
