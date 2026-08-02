import { NextRequest, NextResponse } from 'next/server'
import { aiNodeCreationService } from '@/lib/services/ai-node-creation.service'

// POST /api/graph/ai/create-node - AI智能创建节点
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { name, description, context } = body

    if (!name) {
      return NextResponse.json(
        { success: false, error: '节点名称不能为空' },
        { status: 400 }
      )
    }

    const result = await aiNodeCreationService.createNodeWithAI({
      name,
      description,
      context,
    })

    if (!result.success) {
      return NextResponse.json(
        { success: false, error: result.error },
        { status: 500 }
      )
    }

    return NextResponse.json({
      success: true,
      data: {
        node: result.node,
        matchedETFs: result.matchedETFs,
        matchedIndices: result.matchedIndices,
        suggestedEdges: result.suggestedEdges,
        reasoning: result.reasoning,
      }
    })
  } catch (error) {
    console.error('AI创建节点失败:', error)
    return NextResponse.json(
      { success: false, error: 'AI创建节点失败' },
      { status: 500 }
    )
  }
}

// POST /api/graph/ai/batch-create - AI批量创建节点
export async function PUT(request: NextRequest) {
  try {
    const body = await request.json()
    const { nodes } = body

    if (!Array.isArray(nodes) || nodes.length === 0) {
      return NextResponse.json(
        { success: false, error: '节点列表不能为空' },
        { status: 400 }
      )
    }

    const results = await aiNodeCreationService.batchCreateNodesWithAI(nodes)

    return NextResponse.json({
      success: true,
      data: {
        total: results.length,
        succeeded: results.filter(r => r.success).length,
        failed: results.filter(r => !r.success).length,
        results,
      }
    })
  } catch (error) {
    console.error('AI批量创建节点失败:', error)
    return NextResponse.json(
      { success: false, error: 'AI批量创建节点失败' },
      { status: 500 }
    )
  }
}
