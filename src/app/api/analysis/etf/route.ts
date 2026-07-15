import { NextRequest, NextResponse } from 'next/server'
import { scoreService } from '@/lib/services/score.service'
import { claudeClient } from '@/lib/ai/claude'
import { calculateAllIndicators, generateSignals, DailyData } from '@/lib/indicators'

const DATA_SERVICE_URL = process.env.DATA_SERVICE_URL || 'http://localhost:8000'

// ETF 信息池（与 Python 服务同步）
const ETF_POOL: Record<string, { name: string; trackingIndex: string; totalAssets: number; trackingError: number }> = {
  '510300': { name: '沪深300ETF', trackingIndex: '沪深300', totalAssets: 800, trackingError: 0.05 },
  '159919': { name: '沪深300ETF(易方达)', trackingIndex: '沪深300', totalAssets: 300, trackingError: 0.08 },
  '510500': { name: '中证500ETF', trackingIndex: '中证500', totalAssets: 200, trackingError: 0.10 },
  '588000': { name: '科创50ETF', trackingIndex: '科创50', totalAssets: 600, trackingError: 0.08 },
  '159915': { name: '创业板ETF', trackingIndex: '创业板指', totalAssets: 150, trackingError: 0.12 },
  '512480': { name: '半导体ETF', trackingIndex: '中证全指半导体', totalAssets: 300, trackingError: 0.10 },
  '159995': { name: '芯片ETF', trackingIndex: '国证芯片', totalAssets: 200, trackingError: 0.12 },
  '515070': { name: 'AI ETF', trackingIndex: '中证人工智能', totalAssets: 100, trackingError: 0.15 },
  '515880': { name: '通信ETF', trackingIndex: '中证全指通信设备', totalAssets: 150, trackingError: 0.12 },
  '159853': { name: '光通信ETF', trackingIndex: '中证光通信', totalAssets: 100, trackingError: 0.15 },
  '159888': { name: '算力ETF', trackingIndex: '中证算力', totalAssets: 80, trackingError: 0.18 },
}

// POST /api/analysis/etf - ETF AI分析
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { ticker, includeGraph, includeEvents, userQuestion } = body

    if (!ticker) {
      return NextResponse.json(
        { success: false, error: 'ETF代码不能为空' },
        { status: 400 }
      )
    }

    const etfInfo = ETF_POOL[ticker] || { name: '未知ETF', trackingIndex: '未知', totalAssets: 0, trackingError: 0 }

    // 并行获取各类数据
    const [etfDetail, capitalFlowData, newsData] = await Promise.allSettled([
      fetchETFDetail(ticker),
      fetchCapitalFlow(),
      fetchNewsData(),
    ])

    // 计算技术指标和信号
    let signals = undefined
    if (etfDetail.status === 'fulfilled' && etfDetail.value?.history?.length > 0) {
      const dailyData: DailyData[] = etfDetail.value.history.map((h: any) => ({
        date: h.date,
        open: h.open,
        high: h.high,
        low: h.low,
        close: h.close,
        volume: h.volume,
      }))
      const indicators = calculateAllIndicators(dailyData)
      signals = generateSignals(ticker, indicators)
    }

    // 提取资金流向数据
    let capitalFlow = undefined
    if (capitalFlowData.status === 'fulfilled' && capitalFlowData.value) {
      const cf = capitalFlowData.value
      capitalFlow = {
        mainForceNet: cf.market?.institutionalNet || 0,
        northboundNet: cf.institutional?.northboundNet || 0,
      }
    }

    // 提取事件数据
    let events = undefined
    if (newsData.status === 'fulfilled' && newsData.value) {
      events = newsData.value.slice(0, 10).map((n: any) => ({
        title: n.title,
        sentiment: n.sentiment,
        impact: n.impact,
      }))
    }

    // 计算综合评分
    const score = await scoreService.calculateScore({
      ticker,
      name: etfInfo.name,
      trackingIndex: etfInfo.trackingIndex,
      signals,
      capitalFlow,
      events,
      graphPaths: undefined,
      etfData: {
        ...etfInfo,
        volume: etfDetail.status === 'fulfilled' ? etfDetail.value?.price : 0,
      },
    })

    // 生成AI分析报告
    const aiReport = await generateAIReport(ticker, etfInfo, score, userQuestion, signals, capitalFlow)

    return NextResponse.json({
      success: true,
      data: {
        score,
        aiReport,
        graphPaths: undefined,
        recentEvents: events,
        dataSources: {
          etfDetail: etfDetail.status === 'fulfilled' ? 'ok' : 'unavailable',
          capitalFlow: capitalFlowData.status === 'fulfilled' ? 'ok' : 'unavailable',
          news: newsData.status === 'fulfilled' ? 'ok' : 'unavailable',
        }
      }
    })
  } catch (error) {
    console.error('ETF分析失败:', error)
    return NextResponse.json({
      success: false,
      error: 'ETF分析失败，请确认数据服务和Claude API已配置',
      data: null,
    })
  }
}

async function fetchETFDetail(ticker: string) {
  try {
    const resp = await fetch(`${DATA_SERVICE_URL}/api/etf/${ticker}`, {
      signal: AbortSignal.timeout(10000),
    })
    const data = await resp.json()
    return data.success ? data.data : null
  } catch {
    return null
  }
}

async function fetchCapitalFlow() {
  try {
    const resp = await fetch(`${DATA_SERVICE_URL}/api/capital-flow/macro`, {
      signal: AbortSignal.timeout(10000),
    })
    const data = await resp.json()
    return data.success ? data.data : null
  } catch {
    return null
  }
}

async function fetchNewsData() {
  try {
    const resp = await fetch(`${DATA_SERVICE_URL}/api/news/ai-hardware?limit=10`, {
      signal: AbortSignal.timeout(10000),
    })
    const data = await resp.json()
    return data.success ? data.data?.items : null
  } catch {
    return null
  }
}

async function generateAIReport(
  ticker: string,
  etfInfo: { name: string; trackingIndex: string },
  score: any,
  userQuestion?: string,
  signals?: any,
  capitalFlow?: any
) {
  // 构建更丰富的分析 prompt
  let contextInfo = ''
  if (signals) {
    contextInfo += `\n技术面信号：趋势方向=${signals.signals.trend.direction}，趋势得分=${signals.signals.trend.score}`
    contextInfo += `，动量得分=${signals.signals.momentum.score}`
    if (signals.signals.trend.details.length > 0) {
      contextInfo += `，趋势特征：${signals.signals.trend.details.join('、')}`
    }
  }
  if (capitalFlow) {
    contextInfo += `\n资金面：主力净流入=${capitalFlow.mainForceNet}亿，北向净买入=${capitalFlow.northboundNet}亿`
  }

  const prompt = `请为${etfInfo.name}（${ticker}）生成一份投资分析报告。

ETF信息：
- 名称：${etfInfo.name}
- 跟踪指数：${etfInfo.trackingIndex}
- 综合评分：${score.compositeScore}/100
- 评级：${score.rating}
${contextInfo}

用户问题：${userQuestion || '请给出综合分析和操作建议'}

请用中文回答，包含以下内容：
1. 市场环境总览
2. 技术面分析
3. 资金面分析
4. 产业链传导分析
5. 风险提示
6. 投资建议（买入/持有/卖出，建议仓位，持有周期）`

  return claudeClient.analyzeEvent({
    title: `${etfInfo.name}投资分析`,
    content: prompt,
    source: 'AI分析',
    publishTime: new Date().toISOString()
  }).catch(() => null)
}
