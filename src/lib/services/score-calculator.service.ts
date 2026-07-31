// src/lib/services/score-calculator.service.ts

import prisma from '@/lib/db/prisma'
import { ScoreComponents } from '@/types/scoring'

export class ScoreCalculatorService {
  /**
   * 计算市场基本面评分 (0-50分)
   * - 资金流向 30分
   * - 板块表现 20分
   */
  async calculateMarketScore(nodeId: string): Promise<number> {
    // Phase 1: Simplified implementation
    // Uses placeholder logic as SectorCapitalFlow needs sector-to-node mapping

    const node = await prisma.graphNode.findUnique({
      where: { id: nodeId },
      select: { name: true, type: true },
    })

    if (!node) return 0

    // TODO: Map node to sector, query SectorCapitalFlow
    // For now, return a baseline score based on node level
    // This will be enhanced in Phase 2 with real market data integration

    // Placeholder: nodes with more connections get slightly higher baseline
    const edgeCount = await prisma.graphEdge.count({
      where: {
        OR: [{ sourceId: nodeId }, { targetId: nodeId }],
      },
    })

    // Baseline 25-30 range, modulated by connectivity
    const baseline = 25
    const connectivityBonus = Math.min(edgeCount, 10) * 0.5

    return Math.min(baseline + connectivityBonus, 50)
  }

  /**
   * 计算新闻舆情面评分 (0-30分)
   * - 新闻热度 15分
   * - 情感得分 15分
   */
  async calculateNewsScore(nodeId: string): Promise<number> {
    const node = await prisma.graphNode.findUnique({
      where: { id: nodeId },
      select: {
        newsCount7d: true,
        sentimentScore: true,
      },
    })

    if (!node) return 0

    // 新闻热度得分 (0-15分)
    const newsCount = node.newsCount7d || 0
    const volumeScore = Math.min(newsCount / 50, 1) * 10

    // 获取关联新闻的impact加权
    const newsLinks = await prisma.newsGraphLink.findMany({
      where: { nodeId },
      include: {
        news: {
          select: { impact: true },
        },
      },
      take: 100,
    })

    const totalImpact = newsLinks.reduce((sum, link) => sum + (link.news.impact || 3), 0)
    const avgImpact = newsLinks.length > 0 ? totalImpact / newsLinks.length : 3
    const importanceScore = (avgImpact / 5) * 5

    const newsHotScore = volumeScore + importanceScore

    // 情感得分 (0-15分)
    const sentiment = node.sentimentScore || 0
    const sentimentScore = ((sentiment + 1) / 2) * 10

    // 正面新闻占比
    const positiveNews = newsLinks.filter(
      (link) => link.sentiment === 'positive'
    ).length
    const positiveRatio = newsLinks.length > 0 ? positiveNews / newsLinks.length : 0
    const positiveScore = positiveRatio * 5

    const sentimentTotalScore = sentimentScore + positiveScore

    return Math.min(newsHotScore + sentimentTotalScore, 30)
  }

  /**
   * 计算图谱结构面评分 (0-20分)
   * - 节点重要性 12分 (入度6+出度6)
   * - 传导活跃度 8分
   */
  async calculateGraphScore(nodeId: string): Promise<number> {
    // 获取入度和出度
    const [inEdges, outEdges] = await Promise.all([
      prisma.graphEdge.count({
        where: { targetId: nodeId },
      }),
      prisma.graphEdge.count({
        where: { sourceId: nodeId },
      }),
    ])

    // 节点重要性得分 (0-12分)
    const inDegreeScore = Math.min(inEdges / 5, 1) * 6
    const outDegreeScore = Math.min(outEdges / 5, 1) * 6
    const importanceScore = inDegreeScore + outDegreeScore

    // 传导活跃度得分 (0-8分)
    // Phase 1: 简化实现，基于边的权重和数量
    const allEdges = await prisma.graphEdge.findMany({
      where: {
        OR: [{ sourceId: nodeId }, { targetId: nodeId }],
      },
      select: { weight: true, confidence: true },
    })

    const avgWeight =
      allEdges.length > 0
        ? allEdges.reduce((sum, e) => sum + e.weight, 0) / allEdges.length
        : 0
    const activityScore = Math.min(allEdges.length / 10, 1) * avgWeight * 8

    return Math.min(importanceScore + activityScore, 20)
  }

  /**
   * 计算总分并返回评分组成
   */
  async calculateTotalScore(nodeId: string): Promise<ScoreComponents> {
    const [marketScore, newsScore, graphScore] = await Promise.all([
      this.calculateMarketScore(nodeId),
      this.calculateNewsScore(nodeId),
      this.calculateGraphScore(nodeId),
    ])

    return {
      marketFundamental: marketScore,
      newsSentiment: newsScore,
      graphStructure: graphScore,
    }
  }
}

// Export singleton
export const scoreCalculator = new ScoreCalculatorService()
