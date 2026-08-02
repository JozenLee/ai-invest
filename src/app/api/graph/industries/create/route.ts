// src/app/api/graph/industries/create/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'

const createIndustrySchema = z.object({
  name: z.string().min(2).max(50),
  description: z.string().optional()
})

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { name, description } = createIndustrySchema.parse(body)

    // 调用Python数据服务
    const dataServiceUrl = process.env.DATA_SERVICE_URL || 'http://localhost:8000'
    const response = await fetch(`${dataServiceUrl}/api/v1/industry-graph/explore`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, description })
    })

    if (!response.ok) {
      throw new Error('数据服务调用失败')
    }

    const data = await response.json()

    return NextResponse.json({
      success: true,
      data: {
        taskId: data.task_id,
        industryId: data.industry_id || '',
        status: 'exploring_structure',
        message: 'AI正在探索产业链结构...'
      }
    })
  } catch (error) {
    console.error('创建产业失败:', error)
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : '创建产业失败'
      },
      { status: 500 }
    )
  }
}
