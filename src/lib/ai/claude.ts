// Claude API客户端封装
// 提供事件分析、ETF分析等功能

import Anthropic from '@anthropic-ai/sdk'

export interface ClaudeConfig {
  apiKey?: string
  model?: string
  maxTokens?: number
}

export interface EventAnalysisRequest {
  title: string
  content: string
  source: string
  publishTime: string
}

export interface EventAnalysisResponse {
  category: string
  sentiment: {
    score: number
    confidence: number
    label: string
  }
  impact: {
    timeHorizon: string
    magnitude: number
    affectedSectors: Array<{
      sector: string
      direction: 'positive' | 'negative'
      weight: number
    }>
    reasoning: string
  }
  entities: {
    companies: string[]
    sectors: string[]
    products: string[]
    people: string[]
  }
  summary: string
}

export class ClaudeClient {
  private client: Anthropic | null = null
  private model: string
  private maxTokens: number

  constructor(config?: ClaudeConfig) {
    this.model = config?.model || process.env.CLAUDE_MODEL || 'claude-sonnet-4-20250514'
    this.maxTokens = config?.maxTokens || 4096

    const apiKey = config?.apiKey || process.env.ANTHROPIC_API_KEY
    if (apiKey) {
      this.client = new Anthropic({ apiKey })
    }
  }

  /**
   * 分析新闻事件
   */
  async analyzeEvent(request: EventAnalysisRequest): Promise<EventAnalysisResponse> {
    if (!this.client) {
      throw new Error('Claude API 未配置，请设置 ANTHROPIC_API_KEY 环境变量')
    }

    const prompt = this.buildEventAnalysisPrompt(request)

    const message = await this.client.messages.create({
      model: this.model,
      max_tokens: this.maxTokens,
      messages: [
        {
          role: 'user',
          content: prompt
        }
      ],
      system: `你是一位资深的金融分析师，专注于AI硬件产业链分析。
请分析以下新闻事件，并以JSON格式返回分析结果。

分析维度：
1. 事件分类（policy/earnings/product/partnership/supply/tech/regulation/market）
2. 情感分析（-1到1的分数，以及置信度）
3. 影响评估（时间跨度、影响力度1-5、受影响板块及方向）
4. 实体识别（公司、板块、产品、人物）
5. 一句话摘要

请确保返回有效的JSON格式。`
    })

    const content = message.content[0]
    if (content.type === 'text') {
      const jsonMatch = content.text.match(/\{[\s\S]*\}/)
      if (jsonMatch) {
        return JSON.parse(jsonMatch[0])
      }
    }

    throw new Error('Claude API 返回格式异常，无法解析分析结果')
  }

  /**
   * 构建事件分析Prompt
   */
  private buildEventAnalysisPrompt(request: EventAnalysisRequest): string {
    return `请分析以下新闻事件：

标题：${request.title}
内容：${request.content}
来源：${request.source}
发布时间：${request.publishTime}

请以JSON格式返回分析结果，包含以下字段：
{
  "category": "事件分类",
  "sentiment": {
    "score": 情感分数(-1到1),
    "confidence": 置信度(0到1),
    "label": "情感标签(very_bullish/bullish/neutral/bearish/very_bearish)"
  },
  "impact": {
    "timeHorizon": "影响时间跨度(short/medium/long)",
    "magnitude": 影响力度(1-5),
    "affectedSectors": [
      {
        "sector": "板块名称",
        "direction": "影响方向(positive/negative)",
        "weight": 影响权重(0-1)
      }
    ],
    "reasoning": "推理过程"
  },
  "entities": {
    "companies": ["公司列表"],
    "sectors": ["板块列表"],
    "products": ["产品列表"],
    "people": ["人物列表"]
  },
  "summary": "一句话摘要"
}`
  }

  /**
   * 通用的文本生成接口
   */
  async complete(params: {
    prompt: string
    system?: string
    maxTokens?: number
  }): Promise<string> {
    if (!this.client) {
      throw new Error('Claude API 未配置，请设置 ANTHROPIC_API_KEY 环境变量')
    }

    const message = await this.client.messages.create({
      model: this.model,
      max_tokens: params.maxTokens || this.maxTokens,
      messages: [
        {
          role: 'user',
          content: params.prompt
        }
      ],
      system: params.system,
    })

    const content = message.content[0]
    if (content.type === 'text') {
      return content.text
    }

    throw new Error('Claude API 返回格式异常')
  }
}

// 全局单例
export const claudeClient = new ClaudeClient()
