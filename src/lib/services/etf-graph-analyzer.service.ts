import { prisma } from '@/lib/db'
import { ETFGraphMapperService, type NodeExposure } from './etf-graph-mapper.service'
import Anthropic from '@anthropic-ai/sdk'

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY
})

export interface GraphPerspectiveAnalysis {
  coverage: {
    totalNodes: number
    coveredNodes: number
    coverageRate: number
    uncoveredLevels: string[]
  }
  cycleRisk: {
    upturn: number
    peak: number
    downturn: number
    trough: number
    neutral: number
    riskScore: number
  }
  supplyChainBalance: {
    upstream: number
    midstream: number
    downstream: number
    isBalanced: boolean
  }
  momentum: {
    weightedAverage: number
    distribution: {
      high: number
      medium: number
      low: number
    }
  }
  insights: string[]
}

export class ETFGraphAnalyzerService {
  async analyze(ticker: string): Promise<GraphPerspectiveAnalysis> {
    // 1. 获取持仓映射
    const mapper = new ETFGraphMapperService()
    const exposures = await mapper.mapETFToGraph(ticker)

    // 2. 获取所有图谱节点
    const allNodes = await prisma.graphNode.findMany()

    // 3. 分析覆盖度
    const coverage = this.analyzeCoverage(exposures, allNodes)

    // 4. 分析周期风险
    const cycleRisk = this.analyzeCycleRisk(exposures, allNodes)

    // 5. 分析供应链平衡
    const balance = this.analyzeBalance(exposures, allNodes)

    // 6. 分析动量
    const momentum = this.analyzeMomentum(exposures, allNodes)

    // 7. 生成 AI 洞察
    const insights = await this.generateInsights(
      ticker,
      coverage,
      cycleRisk,
      balance,
      momentum
    )

    return {
      coverage,
      cycleRisk,
      supplyChainBalance: balance,
      momentum,
      insights
    }
  }

  private analyzeCoverage(exposures: NodeExposure[], allNodes: any[]) {
    const coveredNodes = exposures.length
    const totalNodes = allNodes.length
    const coverageRate = totalNodes > 0 ? coveredNodes / totalNodes : 0

    const coveredTypes = new Set(exposures.map(e => e.nodeType))
    const allTypes = new Set(allNodes.map(n => n.type))
    const uncoveredLevels = Array.from(allTypes).filter(t => !coveredTypes.has(t))

    return {
      totalNodes,
      coveredNodes,
      coverageRate: Math.round(coverageRate * 10000) / 10000,
      uncoveredLevels
    }
  }

  private analyzeCycleRisk(exposures: NodeExposure[], allNodes: any[]) {
    const nodeMap = new Map(allNodes.map(n => [n.id, n]))

    let upturn = 0, peak = 0, downturn = 0, trough = 0, neutral = 0

    for (const exp of exposures) {
      const node = nodeMap.get(exp.nodeId)
      if (!node) continue

      const weight = exp.exposure
      const cyclePos = node.cyclePos

      if (cyclePos === 'upturn') upturn += weight
      else if (cyclePos === 'peak') peak += weight
      else if (cyclePos === 'downturn') downturn += weight
      else if (cyclePos === 'trough') trough += weight
      else neutral += weight
    }

    // 风险得分: peak和downturn越高风险越大
    const riskScore = Math.round((peak * 0.6 + downturn * 0.4) * 100)

    return {
      upturn: Math.round(upturn * 10000) / 10000,
      peak: Math.round(peak * 10000) / 10000,
      downturn: Math.round(downturn * 10000) / 10000,
      trough: Math.round(trough * 10000) / 10000,
      neutral: Math.round(neutral * 10000) / 10000,
      riskScore
    }
  }

  private analyzeBalance(exposures: NodeExposure[], allNodes: any[]) {
    const nodeMap = new Map(allNodes.map(n => [n.id, n]))

    let upstream = 0, midstream = 0, downstream = 0

    const upstreamTypes = ['material', 'equipment', 'wafer_foundry']
    const midstreamTypes = ['chip_design', 'packaging', 'memory']
    const downstreamTypes = ['server', 'data_center', 'ai_application']

    for (const exp of exposures) {
      const node = nodeMap.get(exp.nodeId)
      if (!node) continue

      const weight = exp.exposure
      if (upstreamTypes.includes(node.type)) upstream += weight
      else if (midstreamTypes.includes(node.type)) midstream += weight
      else if (downstreamTypes.includes(node.type)) downstream += weight
    }

    const total = upstream + midstream + downstream
    const isBalanced = total > 0 && Math.abs(upstream - midstream) < 0.2 * total && Math.abs(midstream - downstream) < 0.2 * total

    return {
      upstream: Math.round(upstream * 10000) / 10000,
      midstream: Math.round(midstream * 10000) / 10000,
      downstream: Math.round(downstream * 10000) / 10000,
      isBalanced
    }
  }

  private analyzeMomentum(exposures: NodeExposure[], allNodes: any[]) {
    const nodeMap = new Map(allNodes.map(n => [n.id, n]))

    let totalWeightedMomentum = 0
    let totalWeight = 0
    let high = 0, medium = 0, low = 0

    for (const exp of exposures) {
      const node = nodeMap.get(exp.nodeId)
      if (!node || node.momentum === undefined) continue

      const weight = exp.exposure
      totalWeightedMomentum += node.momentum * weight
      totalWeight += weight

      if (node.momentum > 60) high += weight
      else if (node.momentum > 20) medium += weight
      else low += weight
    }

    const weightedAverage = totalWeight > 0 ? totalWeightedMomentum / totalWeight : 0

    return {
      weightedAverage: Math.round(weightedAverage * 100) / 100,
      distribution: {
        high: Math.round(high * 10000) / 10000,
        medium: Math.round(medium * 10000) / 10000,
        low: Math.round(low * 10000) / 10000
      }
    }
  }

  private async generateInsights(
    ticker: string,
    coverage: any,
    cycleRisk: any,
    balance: any,
    momentum: any
  ): Promise<string[]> {
    const prompt = `作为AI硬件产业链投资分析师，基于以下ETF图谱分析数据生成4条简洁的投资洞察（每条不超过30字）：

ETF代码: ${ticker}

产业链覆盖度:
- 覆盖节点: ${coverage.coveredNodes}/${coverage.totalNodes} (${(coverage.coverageRate * 100).toFixed(1)}%)
- 未覆盖领域: ${coverage.uncoveredLevels.join('、') || '无'}

周期风险分布:
- 上升期: ${(cycleRisk.upturn * 100).toFixed(1)}%
- 高位: ${(cycleRisk.peak * 100).toFixed(1)}%
- 下降期: ${(cycleRisk.downturn * 100).toFixed(1)}%
- 底部: ${(cycleRisk.trough * 100).toFixed(1)}%
- 风险得分: ${cycleRisk.riskScore}/100

供应链平衡:
- 上游: ${(balance.upstream * 100).toFixed(1)}%
- 中游: ${(balance.midstream * 100).toFixed(1)}%
- 下游: ${(balance.downstream * 100).toFixed(1)}%
- 是否平衡: ${balance.isBalanced ? '是' : '否'}

动量指标:
- 加权平均: ${momentum.weightedAverage.toFixed(1)}
- 高动量占比: ${(momentum.distribution.high * 100).toFixed(1)}%

请生成4条洞察，格式为JSON数组。`

    try {
      const message = await anthropic.messages.create({
        model: 'claude-opus-4-20250514',
        max_tokens: 1024,
        temperature: 0.3,
        messages: [{
          role: 'user',
          content: prompt
        }]
      })

      const content = message.content[0]
      if (content.type === 'text') {
        const jsonMatch = content.text.match(/\[[\s\S]*\]/)
        if (jsonMatch) {
          return JSON.parse(jsonMatch[0])
        }
        // 备用: 按行分割
        return content.text.split('\n').filter(line => line.trim().length > 0).slice(0, 4)
      }
    } catch (error) {
      console.error('生成洞察失败:', error)
    }

    // 默认洞察
    return [
      `该ETF覆盖产业链${coverage.coveredNodes}个节点，覆盖率${(coverage.coverageRate * 100).toFixed(0)}%`,
      `${(cycleRisk.upturn * 100).toFixed(0)}%仓位处于上升期，周期风险得分${cycleRisk.riskScore}`,
      `供应链布局${balance.isBalanced ? '较为均衡' : '存在结构性偏向'}`,
      `加权平均动量${momentum.weightedAverage.toFixed(0)}，处于${momentum.weightedAverage > 60 ? '强势' : momentum.weightedAverage < -20 ? '弱势' : '中性'}区间`
    ]
  }
}
