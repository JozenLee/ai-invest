// AI智能节点创建服务
// 功能：
// 1. 根据节点名称和描述，AI自动匹配相关的ETF和指数
// 2. AI自动推断节点在图谱中的层级位置
// 3. AI自动识别并创建与其他节点的关系边
// 4. 自动接入市场数据增强

import prisma from '@/lib/db/prisma'
import { Anthropic } from '@anthropic-ai/sdk'

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY || '',
})

// ETF和指数映射表
const AVAILABLE_ETFS = [
  { ticker: '515070', name: 'AI ETF', trackingIndex: '中证人工智能', keywords: ['AI', '人工智能', '算力', 'GPU'] },
  { ticker: '512480', name: '半导体ETF', trackingIndex: '中证全指半导体', keywords: ['半导体', '芯片', '集成电路'] },
  { ticker: '159995', name: '芯片ETF', trackingIndex: '国证芯片', keywords: ['芯片', '芯片设计', '芯片制造'] },
  { ticker: '515880', name: '通信ETF', trackingIndex: '中证全指通信设备', keywords: ['通信', '通信设备', '5G', '光模块'] },
]

const AVAILABLE_INDICES = [
  { code: '930713', name: '中证人工智能主题指数', keywords: ['AI', '人工智能', '算力'] },
  { code: '931865', name: '中证全指半导体指数', keywords: ['半导体', '芯片', '集成电路'] },
  { code: '931160', name: '中证全指通信设备指数', keywords: ['通信', '通信设备', '5G'] },
]

// 节点类型层级定义
const NODE_TYPE_HIERARCHY = {
  'ai_index': { level: 0, parent: null, description: 'AI算力指数' },
  'ai_l1': { level: 1, parent: 'ai_index', description: 'AI算力一级分类' },
  'ai_l2': { level: 2, parent: 'ai_l1', description: 'AI算力二级分类' },
  'chip_design': { level: 3, parent: 'ai_l2', description: '芯片设计' },
  'memory': { level: 3, parent: 'ai_l2', description: '存储' },
  'server': { level: 3, parent: 'ai_l2', description: '服务器' },
  'cooling': { level: 3, parent: 'ai_l2', description: '散热' },
  'data_center': { level: 3, parent: 'ai_l2', description: '数据中心' },
  'optical_module': { level: 3, parent: 'ai_l2', description: '光模块' },
  'networking': { level: 3, parent: 'ai_l2', description: '网络设备' },
}

interface AINodeCreationRequest {
  name: string              // 节点名称，如 "液冷散热"
  description?: string      // 节点描述
  context?: string         // 额外上下文信息
}

interface AINodeCreationResult {
  success: boolean
  node?: {
    id: string
    type: string
    name: string
    description: string
    level: number
    parentId?: string
  }
  matchedETFs?: Array<{
    ticker: string
    name: string
    relevance: number
    reason: string
  }>
  matchedIndices?: Array<{
    code: string
    name: string
    relevance: number
    reason: string
  }>
  suggestedEdges?: Array<{
    targetNodeId: string
    targetNodeName: string
    relation: string
    direction: string
    weight: number
    evidence: string
  }>
  reasoning?: string
  error?: string
}

export class AINodeCreationService {
  /**
   * AI智能创建节点
   */
  async createNodeWithAI(request: AINodeCreationRequest): Promise<AINodeCreationResult> {
    try {
      console.log(`[AI Node Creation] 开始分析节点: ${request.name}`)

      // 1. 获取现有图谱结构
      const existingNodes = await prisma.graphNode.findMany({
        select: { id: true, type: true, name: true, level: true, description: true }
      })

      const existingEdges = await prisma.graphEdge.findMany({
        select: { sourceId: true, targetId: true, relation: true },
        take: 100
      })

      // 2. 调用Claude进行AI分析
      const aiAnalysis = await this.analyzeNodeWithClaude(
        request,
        existingNodes,
        existingEdges
      )

      if (!aiAnalysis.success) {
        return { success: false, error: aiAnalysis.error }
      }

      // 3. 创建节点
      const node = await prisma.graphNode.create({
        data: {
          type: aiAnalysis.nodeType,
          name: request.name,
          description: aiAnalysis.description,
          level: aiAnalysis.level,
          parentId: aiAnalysis.parentId,
          metadata: JSON.stringify({
            trackingETFs: aiAnalysis.matchedETFs,
            relatedIndex: aiAnalysis.matchedIndices?.[0]?.code,
            aiGenerated: true,
            createdAt: new Date().toISOString(),
          })
        }
      })

      // 4. 创建关系边
      const createdEdges = []
      if (aiAnalysis.suggestedEdges) {
        for (const edge of aiAnalysis.suggestedEdges) {
          try {
            const createdEdge = await prisma.graphEdge.create({
              data: {
                sourceId: edge.sourceId || node.id,
                targetId: edge.targetId,
                relation: edge.relation,
                weight: edge.weight,
                direction: edge.direction,
                confidence: edge.confidence || 0.8,
                evidence: edge.evidence,
                description: edge.description,
              }
            })
            createdEdges.push(createdEdge)
          } catch (error) {
            console.error(`创建边失败:`, error)
          }
        }
      }

      // 5. 记录变更日志
      await prisma.graphChangeLog.create({
        data: {
          nodeId: node.id,
          action: 'add_node',
          after: JSON.stringify(node),
          reason: `AI自动创建节点：${aiAnalysis.reasoning}`,
          source: 'ai',
        }
      })

      console.log(`[AI Node Creation] 节点创建成功: ${node.id}`)

      return {
        success: true,
        node: {
          id: node.id,
          type: node.type,
          name: node.name,
          description: node.description || '',
          level: node.level,
          parentId: node.parentId || undefined,
        },
        matchedETFs: aiAnalysis.matchedETFs,
        matchedIndices: aiAnalysis.matchedIndices,
        suggestedEdges: aiAnalysis.suggestedEdges?.map((e: any) => ({
          targetNodeId: e.targetId,
          targetNodeName: e.targetNodeName,
          relation: e.relation,
          direction: e.direction,
          weight: e.weight,
          evidence: e.evidence,
        })),
        reasoning: aiAnalysis.reasoning,
      }

    } catch (error) {
      console.error('[AI Node Creation] 失败:', error)
      return {
        success: false,
        error: error instanceof Error ? error.message : '未知错误'
      }
    }
  }

  /**
   * 使用Claude分析节点
   */
  private async analyzeNodeWithClaude(
    request: AINodeCreationRequest,
    existingNodes: any[],
    existingEdges: any[]
  ) {
    const prompt = `你是一个AI硬件产业链知识图谱专家。用户想要创建一个新的节点，请帮助分析并确定：

1. 节点类型（从以下选项中选择最合适的）：
${Object.entries(NODE_TYPE_HIERARCHY).map(([type, info]) => `   - ${type}: ${info.description} (层级${info.level})`).join('\n')}

2. 相关的ETF（从以下列表匹配）：
${AVAILABLE_ETFS.map(etf => `   - ${etf.ticker} ${etf.name}: 关键词 ${etf.keywords.join(', ')}`).join('\n')}

3. 相关的指数（从以下列表匹配）：
${AVAILABLE_INDICES.map(idx => `   - ${idx.code} ${idx.name}: 关键词 ${idx.keywords.join(', ')}`).join('\n')}

4. 在图谱中的父节点（从现有节点中选择）：
${existingNodes.slice(0, 20).map(n => `   - ${n.id}: ${n.name} (${n.type}, level ${n.level})`).join('\n')}

5. 与其他节点的关系（关系类型：contain/supply_chain/demand_driver/technology_driver/complementary/upstream/downstream）

**新节点信息：**
- 名称：${request.name}
${request.description ? `- 描述：${request.description}` : ''}
${request.context ? `- 上下文：${request.context}` : ''}

**现有图谱结构样例：**
- 节点数量：${existingNodes.length}
- 关系数量：${existingEdges.length}

请以JSON格式返回分析结果：
\`\`\`json
{
  "nodeType": "节点类型",
  "level": 层级数字,
  "parentId": "父节点ID或null",
  "description": "节点描述（100字以内）",
  "matchedETFs": [
    {
      "ticker": "ETF代码",
      "name": "ETF名称",
      "relevance": 相关度0-1,
      "reason": "匹配原因"
    }
  ],
  "matchedIndices": [
    {
      "code": "指数代码",
      "name": "指数名称",
      "relevance": 相关度0-1,
      "reason": "匹配原因"
    }
  ],
  "suggestedEdges": [
    {
      "targetId": "目标节点ID",
      "targetNodeName": "目标节点名称",
      "relation": "关系类型",
      "direction": "positive/negative",
      "weight": 权重0-1,
      "confidence": 置信度0-1,
      "evidence": "证据说明",
      "description": "关系描述"
    }
  ],
  "reasoning": "整体分析推理过程"
}
\`\`\`

注意：
- 如果没有匹配的ETF/指数，返回空数组
- 如果无法确定父节点，parentId返回null
- suggestedEdges中只包含高置信度（>0.7）的关系
- 优先创建supply_chain（供应链）和complementary（互补）关系`

    try {
      const response = await anthropic.messages.create({
        model: 'claude-3-5-sonnet-20241022',
        max_tokens: 4000,
        messages: [{
          role: 'user',
          content: prompt
        }]
      })

      const content = response.content[0]
      if (content.type !== 'text') {
        throw new Error('Unexpected response type')
      }

      // 提取JSON
      const jsonMatch = content.text.match(/```json\n([\s\S]*?)\n```/)
      if (!jsonMatch) {
        throw new Error('无法解析AI返回的JSON')
      }

      const analysis = JSON.parse(jsonMatch[1])

      return {
        success: true,
        ...analysis
      }

    } catch (error) {
      console.error('[Claude Analysis] 失败:', error)
      return {
        success: false,
        error: error instanceof Error ? error.message : '分析失败'
      }
    }
  }

  /**
   * 批量创建节点
   */
  async batchCreateNodesWithAI(requests: AINodeCreationRequest[]): Promise<AINodeCreationResult[]> {
    const results: AINodeCreationResult[] = []

    for (const request of requests) {
      const result = await this.createNodeWithAI(request)
      results.push(result)

      // 每个节点之间间隔，避免API限制
      await new Promise(resolve => setTimeout(resolve, 1000))
    }

    return results
  }
}

export const aiNodeCreationService = new AINodeCreationService()
