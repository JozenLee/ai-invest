import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db/prisma'

/**
 * POST /api/datasources/[id]/fetch
 * 立即触发数据源采集任务
 *
 * 功能：
 * 1. 验证数据源是否存在且已激活
 * 2. 调用Python数据服务的fetch接口
 * 3. 返回采集任务触发结果
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params

    // 1. 验证数据源是否存在
    const dataSource = await prisma.dataSource.findUnique({
      where: { id }
    })

    if (!dataSource) {
      return NextResponse.json(
        {
          success: false,
          error: '数据源不存在'
        },
        { status: 404 }
      )
    }

    // 2. 检查数据源是否激活
    if (!dataSource.isActive) {
      return NextResponse.json(
        {
          success: false,
          error: '数据源未激活，无法执行采集'
        },
        { status: 400 }
      )
    }

    // 3. 准备数据源配置
    const config = JSON.parse(dataSource.config)
    const fetchPayload = {
      source_id: dataSource.id,
      source_config: {
        driverType: dataSource.driverType,
        provider: dataSource.provider,
        ...config
      }
    }

    // 4. 调用Python数据服务触发采集（等待完成）
    const pythonServiceUrl = process.env.PYTHON_SERVICE_URL || 'http://localhost:8000'
    const response = await fetch(`${pythonServiceUrl}/api/datasources/fetch`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(fetchPayload),
      // 设置较长的超时时间，等待采集完成
      signal: AbortSignal.timeout(120000) // 120秒超时
    })

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}))
      throw new Error(errorData.detail || errorData.error || `HTTP ${response.status}`)
    }

    const result = await response.json()

    // 5. 返回采集结果
    return NextResponse.json({
      success: result.success || true,
      message: '采集完成',
      fetched_count: result.fetched_count,
      processed_count: result.processed_count,
      failed_count: result.failed_count,
      stored_count: result.stored_count,
      duration_ms: result.duration_ms,
      error: result.error
    })

  } catch (error) {
    console.error('触发采集任务失败:', error)

    // 处理超时错误
    if (error instanceof Error && error.name === 'TimeoutError') {
      return NextResponse.json(
        {
          success: false,
          error: '采集任务触发超时，请稍后查看采集日志'
        },
        { status: 504 }
      )
    }

    // 处理连接错误
    if (error instanceof Error && (error.message.includes('ECONNREFUSED') || error.message.includes('fetch failed'))) {
      return NextResponse.json(
        {
          success: false,
          error: 'Python数据服务不可用，请确保数据服务已启动'
        },
        { status: 503 }
      )
    }

    return NextResponse.json(
      {
        success: false,
        error: '触发采集任务失败',
        message: error instanceof Error ? error.message : '未知错误'
      },
      { status: 500 }
    )
  }
}
