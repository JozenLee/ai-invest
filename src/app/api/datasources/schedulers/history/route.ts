import { NextRequest, NextResponse } from 'next/server'

/**
 * GET /api/datasources/schedulers/history
 * 获取调度执行历史
 *
 * Query参数:
 * - datasourceId: 数据源ID过滤
 * - status: 状态过滤 (success/failed)
 * - limit: 返回数量
 * - startDate: 开始日期
 * - endDate: 结束日期
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const datasourceId = searchParams.get('datasourceId')
    const status = searchParams.get('status')
    const limit = searchParams.get('limit') || '10'
    const startDate = searchParams.get('startDate')
    const endDate = searchParams.get('endDate')

    const pythonServiceUrl = process.env.PYTHON_SERVICE_URL || 'http://localhost:8000'

    // 构建查询参数
    const params = new URLSearchParams()
    if (datasourceId) params.append('datasourceId', datasourceId)
    if (status) params.append('status', status)
    params.append('limit', limit)
    if (startDate) params.append('startDate', startDate)
    if (endDate) params.append('endDate', endDate)

    const historyUrl = `${pythonServiceUrl}/schedulers/history?${params.toString()}`

    const response = await fetch(historyUrl, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json'
      },
      signal: AbortSignal.timeout(5000)
    })

    if (!response.ok) {
      return NextResponse.json(
        {
          success: false,
          error: '获取调度历史失败',
          message: `Python服务返回状态码: ${response.status}`
        },
        { status: response.status }
      )
    }

    const data = await response.json()

    // 标准化返回格式
    return NextResponse.json({
      success: true,
      history: data.history || data.data || [],
      total: data.total || (data.history || data.data || []).length
    })

  } catch (error) {
    console.error('获取调度历史失败:', error)

    let errorMessage = '未知错误'
    if (error instanceof Error) {
      if (error.name === 'AbortError') {
        errorMessage = 'Python服务请求超时'
      } else if (error.message.includes('ECONNREFUSED')) {
        errorMessage = 'Python服务未启动或无法连接'
      } else {
        errorMessage = error.message
      }
    }

    // 返回空历史记录而不是503错误
    return NextResponse.json({
      success: true,
      history: [],
      total: 0,
      message: `调度历史服务不可用: ${errorMessage}`
    })
  }
}
