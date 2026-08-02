// src/app/api/graph/industries/tasks/[taskId]/approve-structure/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'

const approveSchema = z.object({
  approved: z.boolean(),
  modifiedStructure: z.any().optional()
})

export async function POST(
  request: NextRequest,
  { params }: { params: { taskId: string } }
) {
  try {
    const { taskId } = params
    const body = await request.json()
    const { approved, modifiedStructure } = approveSchema.parse(body)

    // 调用Python数据服务
    const dataServiceUrl = process.env.DATA_SERVICE_URL || 'http://localhost:8000'
    const response = await fetch(
      `${dataServiceUrl}/api/v1/industry-graph/tasks/${taskId}/approve-structure`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ approved, modified_structure: modifiedStructure })
      }
    )

    if (!response.ok) {
      throw new Error('审核骨架失败')
    }

    return NextResponse.json({
      success: true,
      message: '骨架已确认，开始填充企业信息...'
    })
  } catch (error) {
    console.error('审核骨架失败:', error)
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : '审核骨架失败'
      },
      { status: 500 }
    )
  }
}
