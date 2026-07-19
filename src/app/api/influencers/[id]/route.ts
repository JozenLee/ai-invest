import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db/prisma';

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const influencer = await prisma.influencer.findUnique({
      where: { id: params.id },
      include: {
        _count: { select: { posts: true } },
      },
    });

    if (!influencer) {
      return NextResponse.json(
        { success: false, error: 'Influencer not found' },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      data: {
        id: influencer.id,
        name: influencer.name,
        platform: influencer.platform,
        accountId: influencer.accountId,
        profileUrl: influencer.profileUrl,
        avatarUrl: influencer.avatarUrl,
        category: influencer.category,
        tags: influencer.tags ? JSON.parse(influencer.tags) : [],
        isActive: influencer.isActive,
        postCount: influencer._count.posts,
        createdAt: influencer.createdAt.toISOString(),
      },
    });
  } catch (error) {
    console.error('Error fetching influencer:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch influencer' },
      { status: 500 }
    );
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const body = await request.json();
    const { name, category, tags, isActive } = body;

    const updateData: any = {};
    if (name !== undefined) updateData.name = name;
    if (category !== undefined) updateData.category = category;
    if (tags !== undefined) updateData.tags = JSON.stringify(tags);
    if (isActive !== undefined) updateData.isActive = isActive;

    const influencer = await prisma.influencer.update({
      where: { id: params.id },
      data: updateData,
    });

    return NextResponse.json({
      success: true,
      data: {
        id: influencer.id,
        name: influencer.name,
      },
    });
  } catch (error) {
    console.error('Error updating influencer:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to update influencer' },
      { status: 500 }
    );
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    await prisma.influencer.delete({
      where: { id: params.id },
    });

    return NextResponse.json({
      success: true,
      message: 'Influencer deleted successfully',
    });
  } catch (error) {
    console.error('Error deleting influencer:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to delete influencer' },
      { status: 500 }
    );
  }
}
