import { NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';

const PYTHON_API_URL = process.env.PYTHON_API_URL || 'http://localhost:8000';

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
  baseURL: process.env.ANTHROPIC_BASE_URL,
});

/**
 * POST /api/ai/analyze - AI分析（支持新闻事件分析和产业综合分析）
 */
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { type } = body;

    // 如果是产业综合分析，直接在Next.js处理
    if (type === 'industry_comprehensive') {
      const { data } = body;
      const { industryName, companyTrend, marketTrend, recentNews } = data;

      const prompt = `作为资深投资分析师，请对${industryName}领域进行综合投资分析。

## 企业发展趋势
${companyTrend || '暂无数据'}

## 大盘趋势
${marketTrend || '暂无数据'}

## 最新资讯
${recentNews?.map((n: any) => `- ${n.title}: ${n.summary}`).join('\n') || '暂无数据'}

请从以下维度进行综合分析（控制在600字以内）：
1. 领域整体发展态势
2. 投资机会与风险
3. 关键关注点
4. 投资展望

要求：
- 客观专业，数据驱动
- 结合企业、市场和资讯的综合视角
- 突出关键发现和投资价值`;

      const message = await anthropic.messages.create({
        model: process.env.CLAUDE_MODEL || 'claude-3-5-sonnet-20241022',
        max_tokens: 2000,
        messages: [
          {
            role: 'user',
            content: prompt,
          },
        ],
      });

      const analysis = message.content[0].type === 'text' ? message.content[0].text : '';

      return NextResponse.json({ success: true, analysis });
    }

    // 其他类型的分析转发到Python服务
    const response = await fetch(`${PYTHON_API_URL}/api/ai/analyze`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const error = await response.json();
      return NextResponse.json(
        {
          success: false,
          error: error.detail || 'AI analysis failed',
        },
        { status: response.status }
      );
    }

    const data = await response.json();
    return NextResponse.json(data);
  } catch (error) {
    console.error('Error in AI analysis:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'AI analysis failed',
      },
      { status: 500 }
    );
  }
}
