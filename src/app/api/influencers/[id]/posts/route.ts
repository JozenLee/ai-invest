import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db/prisma';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const searchParams = request.nextUrl.searchParams;
    const limit = Math.min(parseInt(searchParams.get('limit') || '20'), 100);
    const offset = parseInt(searchParams.get('offset') || '0');

    const total = await prisma.influencerPost.count({
      where: { influencerId: id },
    });

    const posts = await prisma.influencerPost.findMany({
      where: { influencerId: id },
      orderBy: { publishTime: 'desc' },
      take: limit,
      skip: offset,
    });

    const formattedPosts = posts.map(post => ({
      id: post.id,
      influencerId: post.influencerId,
      content: post.content,
      url: post.originalUrl || '',
      publishTime: post.publishTime.toISOString(),
      sentiment: post.sentiment,
      extractedTopics: post.extractedTopics ? JSON.parse(post.extractedTopics) : [],
      relatedDomains: post.relatedDomains ? JSON.parse(post.relatedDomains) : [],
      createdAt: post.createdAt.toISOString(),
    }));

    return NextResponse.json({
      success: true,
      data: {
        total,
        items: formattedPosts,
        limit,
        offset,
      },
    });
  } catch (error) {
    console.error('Error fetching influencer posts:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch posts' },
      { status: 500 }
    );
  }
}
