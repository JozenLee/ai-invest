import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'

type Preferences = {
  riskTolerance?: 'conservative' | 'balanced' | 'aggressive'
  investmentHorizon?: 'short' | 'medium' | 'long'
}

type ETFAnalysis = {
  name: string
  code: string
  priceChangePct: number
  trend: string
}

type Position = {
  name: string
  symbol: string
  quantity: number
  profitLossPct: number
}

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
  baseURL: process.env.ANTHROPIC_BASE_URL,
})

function stripJsonFence(value: string) {
  return value.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '')
}

function extractStringField(text: string, key: string, nextKeys: string[] = []) {
  const marker = `"${key}"`
  const markerStart = text.indexOf(marker)
  if (markerStart < 0) return undefined
  const colon = text.indexOf(':', markerStart + marker.length)
  const valueStart = text.indexOf('"', colon + 1)
  if (colon < 0 || valueStart < 0) return undefined
  const boundaries = nextKeys.map((nextKey) => {
    const match = new RegExp(`",\\s*"${nextKey}"\\s*:`).exec(text.slice(valueStart + 1))
    return match ? valueStart + 1 + match.index : -1
  }).filter((index) => index >= 0)
  const valueEnd = boundaries.length > 0 ? Math.min(...boundaries) : text.lastIndexOf('"')
  if (valueEnd <= valueStart) return undefined
  return text.slice(valueStart + 1, valueEnd).replace(/\\n/g, '\n').replace(/\\"/g, '"').replace(/\\\\/g, '\\')
}

function extractBalanced(text: string, start: number, open: string, close: string) {
  let depth = 0
  let quoted = false
  let escaped = false
  for (let index = start; index < text.length; index += 1) {
    const char = text[index]
    if (quoted) {
      if (escaped) escaped = false
      else if (char === '\\') escaped = true
      else if (char === '"') quoted = false
      continue
    }
    if (char === '"') quoted = true
    else if (char === open) depth += 1
    else if (char === close) {
      depth -= 1
      if (depth === 0) return text.slice(start, index + 1)
    }
  }
  return undefined
}

function parseAdviceResponse(content: string) {
  const text = stripJsonFence(content)
  try {
    return JSON.parse(text)
  } catch {
    const recommendationsMarker = text.indexOf('"recommendations"')
    const arrayStart = recommendationsMarker >= 0 ? text.indexOf('[', recommendationsMarker) : -1
    const arrayText = arrayStart >= 0 ? extractBalanced(text, arrayStart, '[', ']') : undefined
    let recommendations: unknown[] = []
    if (arrayText) {
      try {
        recommendations = JSON.parse(arrayText)
      } catch {
        recommendations = (arrayText.match(/\{[\s\S]*?\}/g) || []).map((item) => {
          try { return JSON.parse(item) } catch { return {} }
        })
      }
    }
    return {
      industry: extractStringField(text, 'industry', ['strategy']),
      strategy: extractStringField(text, 'strategy', ['recommendations']),
      recommendations,
      riskWarning: extractStringField(text, 'riskWarning', ['summary']),
      summary: extractStringField(text, 'summary'),
    }
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const {
      industry,
      companyTrend,
      marketTrend,
      newsTrend,
      etfAnalysis,
      preferences,
      positions,
    }: {
      industry?: string
      companyTrend?: string
      marketTrend?: string
      newsTrend?: string
      etfAnalysis?: ETFAnalysis[]
      preferences?: Preferences
      positions?: Position[]
    } = body

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

    const etfList = etfAnalysis?.map((etf) =>
      `${etf.name} (${etf.code}): 涨跌${etf.priceChangePct}%, 趋势${etf.trend}`
    ).join('\n') || '暂无ETF数据'

    const positionList = positions && positions.length > 0
      ? positions.map((p) => `${p.name} (${p.symbol}): 持有${p.quantity}股, 盈亏${p.profitLossPct}%`).join('\n')
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

## 资讯与产业链影响
${newsTrend || '暂无数据'}

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

    const advice = parseAdviceResponse(content)

    return NextResponse.json({ success: true, advice })
  } catch (error) {
    console.error('Investment advice error:', error)
    return NextResponse.json(
      { error: 'Failed to generate investment advice', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}
