import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db/prisma'

// GET /api/events/influencers/[id]/posts
// 获取大V动态列表
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: influencerId } = await params
    const { searchParams } = new URL(request.url)
    const limit = parseInt(searchParams.get('limit') || '20')

    // 检查大V是否存在
    const influencer = await prisma.influencer.findUnique({
      where: { id: influencerId },
    })

    if (!influencer) {
      return NextResponse.json(
        { success: false, error: '大V不存在' },
        { status: 404 }
      )
    }

    // 获取动态列表
    const posts = await prisma.influencerPost.findMany({
      where: { influencerId },
      orderBy: { publishTime: 'desc' },
      take: limit,
    })

    // 格式化返回数据
    const formattedPosts = posts.map((post) => ({
      id: post.id,
      influencerId: post.influencerId,
      content: post.content,
      originalUrl: post.originalUrl,
      publishTime: post.publishTime.toISOString(),
      sentiment: post.sentiment,
      primaryDomain: post.primaryDomain,
      secondaryDomains: post.secondaryDomains ? JSON.parse(post.secondaryDomains) : [],
      opinionSummary: post.opinionSummary,
      opinionStance: post.opinionStance,
      aiProcessed: post.aiProcessed,
      createdAt: post.createdAt.toISOString(),
    }))

    return NextResponse.json({
      success: true,
      data: formattedPosts,
    })
  } catch (error) {
    console.error('获取大V动态失败:', error)
    return NextResponse.json(
      { success: false, error: '获取大V动态失败' },
      { status: 500 }
    )
  }
}
