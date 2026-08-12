// API路由：ETF/指数批量匹配
// POST /api/graph/match-etf-index

import { NextRequest, NextResponse } from 'next/server'
import { etfIndexMatcher } from '@/lib/services/etf-index-matcher.service'

export const maxDuration = 300 // 5分钟超时

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { scope, targetId, options } = body

    // 参数验证
    if (!scope || !['node', 'industry', 'global'].includes(scope)) {
      return NextResponse.json(
        { success: false, error: '无效的scope参数，必须是 node/industry/global' },
        { status: 400 }
      )
    }

    if ((scope === 'node' || scope === 'industry') && !targetId) {
      return NextResponse.json(
        { success: false, error: `${scope} 模式需要提供 targetId` },
        { status: 400 }
      )
    }

    // 执行匹配
    let result

    switch (scope) {
      case 'node':
        const nodeResult = await etfIndexMatcher.matchNode(targetId, options)
        result = {
          success: nodeResult.success,
          data: {
            matched: nodeResult.success ? 1 : 0,
            skipped: 0,
            errors: nodeResult.success ? 0 : 1,
            details: [nodeResult],
          },
        }
        break

      case 'industry':
        const industryResult = await etfIndexMatcher.matchIndustry(targetId, options)
        result = {
          success: industryResult.success,
          data: {
            matched: industryResult.matched,
            skipped: 0,
            errors: industryResult.failed,
            details: industryResult.details,
          },
        }
        break

      case 'global':
        const globalResult = await etfIndexMatcher.matchAll(options)
        result = {
          success: globalResult.success,
          data: {
            matched: globalResult.matched,
            skipped: 0,
            errors: globalResult.failed,
            details: globalResult.details,
          },
        }
        break

      default:
        return NextResponse.json(
          { success: false, error: '未知的scope类型' },
          { status: 400 }
        )
    }

    return NextResponse.json(result)
  } catch (error) {
    console.error('批量匹配失败:', error)
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : '批量匹配失败',
      },
      { status: 500 }
    )
  }
}
