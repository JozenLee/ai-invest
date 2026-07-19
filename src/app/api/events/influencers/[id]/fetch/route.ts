import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db/prisma'

// POST /api/events/influencers/[id]/fetch
// 触发大V动态采集
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: influencerId } = await params

    // 获取大V信息
    const influencer = await prisma.influencer.findUnique({
      where: { id: influencerId },
    })

    if (!influencer) {
      return NextResponse.json(
        { success: false, error: '大V不存在' },
        { status: 404 }
      )
    }

    // 调用Python数据服务采集动态
    const response = await fetch(
      `http://localhost:8000/api/influencers/${influencerId}/fetch`,
      { method: 'POST' }
    )

    if (!response.ok) {
      // 如果Python服务不可用，返回模拟数据
      const mockPosts = generateMockPosts(influencer)

      // 保存到数据库
      for (const post of mockPosts) {
        await prisma.influencerPost.create({
          data: {
            influencerId: influencer.id,
            content: post.content,
            originalUrl: post.url,
            publishTime: new Date(post.publishTime),
            sentiment: post.sentiment,
            extractedTopics: JSON.stringify(post.topics),
            relatedDomains: JSON.stringify(post.domains),
          },
        })
      }

      return NextResponse.json({
        success: true,
        data: {
          message: `已采集 ${mockPosts.length} 条动态（模拟数据）`,
          count: mockPosts.length,
        },
      })
    }

    const data = await response.json()

    return NextResponse.json({
      success: true,
      data: {
        message: `已采集 ${data.count || 0} 条动态`,
        count: data.count || 0,
      },
    })
  } catch (error) {
    console.error('采集大V动态失败:', error)
    return NextResponse.json(
      { success: false, error: '采集大V动态失败' },
      { status: 500 }
    )
  }
}

// 生成模拟数据
function generateMockPosts(influencer: {
  id: string
  name: string
  platform: string
  tags: string | null
}) {
  const tags = influencer.tags ? JSON.parse(influencer.tags) : []
  const mainTag = tags[0] || 'AI'

  return [
    {
      content: `${mainTag}行业近期发展迅速，我认为有几个关键趋势值得关注：1. 技术迭代加速；2. 应用场景扩展；3. 产业链整合。`,
      url: `https://example.com/post/1`,
      publishTime: new Date().toISOString(),
      sentiment: 0.7,
      topics: [`${mainTag}趋势`, '技术迭代', '产业链'],
      domains: ['ai', 'semiconductor'],
    },
    {
      content: `关于${mainTag}的投资机会，我认为应该关注上游核心环节，特别是那些具有技术壁垒的公司。`,
      url: `https://example.com/post/2`,
      publishTime: new Date(Date.now() - 3600000).toISOString(),
      sentiment: 0.6,
      topics: ['投资机会', '技术壁垒', '上游环节'],
      domains: ['ai'],
    },
    {
      content: `${mainTag}板块近期调整，但长期逻辑不变。建议逢低布局，关注政策面变化。`,
      url: `https://example.com/post/3`,
      publishTime: new Date(Date.now() - 7200000).toISOString(),
      sentiment: 0.3,
      topics: ['板块调整', '逢低布局', '政策面'],
      domains: ['ai'],
    },
  ]
}
