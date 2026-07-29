import Anthropic from '@anthropic-ai/sdk'
import {
  GRAPH_EXTRACTION_SCHEMA,
  validateExtractionResult,
  type ExtractionResult
} from '@/lib/ai/schemas/graph-extraction.schema'

export interface ExtractionInput {
  text: string
  type: 'report' | 'news' | 'article'
  metadata?: {
    title?: string
    source?: string
    publishDate?: Date
  }
}

export interface ExtractionResultWithMetadata extends ExtractionResult {
  metadata: {
    tokensUsed: number
    durationMs: number
  }
}

export class GraphExtractorService {
  private client: Anthropic

  constructor(apiKey?: string) {
    const key = apiKey || process.env.ANTHROPIC_API_KEY
    if (!key) {
      throw new Error('ANTHROPIC_API_KEY environment variable is required')
    }
    const baseURL = process.env.ANTHROPIC_BASE_URL
    this.client = new Anthropic({
      apiKey: key,
      ...(baseURL && { baseURL })
    })
  }

  async extract(input: ExtractionInput): Promise<ExtractionResultWithMetadata> {
    const startTime = Date.now()

    // Build prompt
    const prompt = this.buildPrompt(input)

    // Call Claude with structured output
    const response = await this.client.messages.create({
      model: process.env.CLAUDE_MODEL || 'claude-opus-5',
      max_tokens: 4000,
      temperature: 0.3,
      messages: [{
        role: 'user',
        content: prompt
      }],
      // Note: response_format is not yet supported in SDK
      // This is a placeholder for when it becomes available
      // For now, we'll parse JSON from text response
    })

    const durationMs = Date.now() - startTime

    // Extract and parse result
    const textContent = response.content.find(c => c.type === 'text')
    if (!textContent || textContent.type !== 'text') {
      throw new Error('No text content in Claude response')
    }

    let extractedData: unknown
    try {
      // Strip markdown code blocks if present
      let jsonText = textContent.text.trim()
      if (jsonText.startsWith('```json')) {
        jsonText = jsonText.replace(/^```json\s*\n/, '').replace(/\n```\s*$/, '')
      } else if (jsonText.startsWith('```')) {
        jsonText = jsonText.replace(/^```\s*\n/, '').replace(/\n```\s*$/, '')
      }

      // Try to fix common JSON issues
      // Remove trailing commas before closing braces/brackets
      jsonText = jsonText.replace(/,(\s*[}\]])/g, '$1')

      extractedData = JSON.parse(jsonText)
    } catch (error) {
      // Log the problematic JSON for debugging
      console.error('Failed to parse Claude response:', textContent.text.substring(0, 500))
      throw new Error(`Failed to parse JSON: ${error}`)
    }

    // Validate
    const validation = validateExtractionResult(extractedData)
    if (!validation.success) {
      throw new Error(`Validation failed: ${validation.error}`)
    }

    // Calculate tokens
    const tokensUsed = (response.usage.input_tokens || 0) + (response.usage.output_tokens || 0)

    return {
      ...validation.data!,
      metadata: {
        tokensUsed,
        durationMs
      }
    }
  }

  private buildPrompt(input: ExtractionInput): string {
    const { text, type, metadata } = input

    let contextInfo = ''
    if (metadata?.title) contextInfo += `标题：${metadata.title}\n`
    if (metadata?.source) contextInfo += `来源：${metadata.source}\n`
    if (metadata?.publishDate) {
      contextInfo += `日期：${metadata.publishDate.toISOString().split('T')[0]}\n`
    }

    return `你是一个AI硬件产业链知识图谱专家。请从以下文本中提取实体和关系。

${contextInfo ? contextInfo + '\n' : ''}文本内容：
${text}

请识别：

1. **实体（节点）**：
   - 产业链环节：芯片设计、晶圆代工、封装测试、设备、材料、EDA等
   - 技术领域：HBM、CPO、液冷、光模块等
   - 相关公司和产品

2. **关系（边）**：
   - 供应链关系（supply_chain）：上下游
   - 需求驱动（demand_driver）：需求拉动
   - 技术演进（tech_evolution）：技术升级路径
   - 竞争/互补关系
   - 政策影响

对每个实体和关系，必须提供：
- **置信度**（0-1）：你对这个判断的确定程度
- **支撑证据**：原文中的具体引用（最多200字）
- **量化指标**：权重、影响程度等

**输出格式**：严格按以下JSON Schema格式输出

${JSON.stringify(GRAPH_EXTRACTION_SCHEMA, null, 2)}

**重要约束**：
- 只提取与AI硬件产业链相关的实体
- 每个实体和关系都必须有具体的文本证据支撑
- 置信度要客观，不确定的不要强行提取
- 关系的weight反映其重要程度（0-1）
- direction为positive表示促进，negative表示抑制
- lag表示传导滞后期（如"1-2个月"、"半年"、"即时"）

直接输出JSON，不要有任何其他文字。`
  }
}

// Singleton instance (lazy-initialized)
let _instance: GraphExtractorService | null = null

export function getGraphExtractorService(): GraphExtractorService {
  if (!_instance) {
    _instance = new GraphExtractorService()
  }
  return _instance
}

// For convenience, export as a getter property
export const graphExtractorService = new Proxy({} as GraphExtractorService, {
  get(target, prop) {
    const instance = getGraphExtractorService()
    return (instance as any)[prop]
  }
})
