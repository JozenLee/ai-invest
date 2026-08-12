import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
  baseURL: process.env.ANTHROPIC_BASE_URL,
})

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { industry, companyTrend, marketTrend, etfAnalysis, preferences, positions } = body

    if (!industry) {
      return NextResponse.json(
        { error: 'industry is required' },
        { status: 400 }
      )
    }

    // 构建投资建议提示词
    const riskLabel = ({
      conservative: '保守型',
      balanced: '平衡型',
      aggressive: '进取型'
    } as const)[preferences?.riskTolerance || 'balanced']

    const horizonLabel = ({
      short: '短期（1-3个月）',
      medium: '中期（3-12个月）',
      long: '长期（1年以上）'
    } as const)[preferences?.investmentHorizon || 'medium']

    const etfList = etfAnalysis?.map((etf: any) =>
      `${etf.name} (${etf.code}): 涨跌${etf.priceChangePct}%, 趋势${etf.trend}`
    ).join('\n') || '暂无ETF数据'

    const positionList = positions?.length > 0
      ? positions.map((p: any) => `${p.name} (${p.symbol}): 持有${p.quantity}股, 盈亏${p.profitLossPct}%`).join('\n')
      : '暂无持仓'

    const prompt = `作为资深投资顾问，请为${industry}领域提供个性化投资建议。

## 投资者画像
- 风险偏好: ${riskLabel}
- 投资周期: ${horizonLabel}

## 当前持仓
${positionList}

## 企业发展趋势
${companyTrend || '暂无数据'}

## 大盘趋势
${marketTrend || '暂无数据'}

## 相关ETF
${etfList}

请提供以下内容（严格按JSON格式返回）：

\`\`\`json
{
  "industry": "${industry}",
  "strategy": "投资策略概述（200字以内）",
  "recommendations": [
    {
      "action": "buy|sell|hold|watch",
      "target": "ETF/指数名称",
      "targetType": "etf|index",
      "reason": "推荐理由",
      "allocation": 20,
      "targetPrice": 1.234
    }
  ],
  "riskWarning": "风险提示（如有）",
  "summary": "建议总结（300字以内）"
}
\`\`\`

要求：
1. 根据风险偏好调整仓位配置
2. 结合持仓情况给出增减仓建议
3. 具体到ETF代码和目标价位
4. 给出明确的操作建议和理由`

    const message = await anthropic.messages.create({
      model: process.env.CLAUDE_MODEL || 'claude-3-5-sonnet-20241022',
      max_tokens: 3000,
      messages: [
        {
          role: 'user',
          content: prompt,
        },
      ],
    })

    const content = message.content[0].type === 'text' ? message.content[0].text : ''

    // 尝试解析JSON
    let advice
    try {
      const jsonMatch = content.match(/```json\n([\s\S]+?)\n```/)
      if (jsonMatch) {
        advice = JSON.parse(jsonMatch[1])
      } else {
        // 如果没有JSON格式，尝试直接解析
        advice = JSON.parse(content)
      }
    } catch (parseError) {
      // 如果解析失败，返回纯文本格式
      advice = {
        industry,
        strategy: content,
        recommendations: [],
        summary: content
      }
    }

    return NextResponse.json({ success: true, advice })
  } catch (error) {
    console.error('Investment advice error:', error)
    return NextResponse.json(
      { error: 'Failed to generate investment advice', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}
