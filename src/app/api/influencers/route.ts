import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db/prisma';

/**
 * GET /api/influencers
 * 获取大V列表
 */
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const platform = searchParams.get('platform');
    const category = searchParams.get('category');
    const isActive = searchParams.get('isActive');

    const where: any = {};
    if (platform) where.platform = platform;
    if (category) where.category = category;
    if (isActive !== null) where.isActive = isActive === 'true';

    const influencers = await prisma.influencer.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      include: {
        _count: {
          select: { posts: true },
        },
      },
    });

    const formattedInfluencers = influencers.map(inf => ({
      id: inf.id,
      name: inf.name,
      platform: inf.platform,
      accountId: inf.accountId,
      profileUrl: inf.profileUrl,
      avatarUrl: inf.avatarUrl,
      category: inf.category,
      tags: inf.tags ? JSON.parse(inf.tags) : [],
      isActive: inf.isActive,
      postCount: inf._count.posts,
      createdAt: inf.createdAt.toISOString(),
    }));

    return NextResponse.json({
      success: true,
      data: formattedInfluencers,
    });
  } catch (error) {
    console.error('Error fetching influencers:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch influencers' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/influencers
 * 添加新的大V监控
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { name, platform, accountId, profileUrl, avatarUrl, category, tags } = body;

    if (!name || !platform || !accountId) {
      return NextResponse.json(
        { success: false, error: 'Missing required fields' },
        { status: 400 }
      );
    }

    const existing = await prisma.influencer.findFirst({
      where: { platform, accountId },
    });

    if (existing) {
      return NextResponse.json(
        { success: false, error: 'Influencer already exists' },
        { status: 400 }
      );
    }

    const influencer = await prisma.influencer.create({
      data: {
        name,
        platform,
        accountId,
        profileUrl: profileUrl || '',
        avatarUrl: avatarUrl || null,
        category: category || null,
        tags: tags ? JSON.stringify(tags) : null,
        isActive: true,
      },
    });

    return NextResponse.json({
      success: true,
      data: {
        id: influencer.id,
        name: influencer.name,
        platform: influencer.platform,
        accountId: influencer.accountId,
        createdAt: influencer.createdAt.toISOString(),
      },
    });
  } catch (error) {
    console.error('Error creating influencer:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to create influencer' },
      { status: 500 }
    );
  }
}
