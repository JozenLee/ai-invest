// src/lib/services/score-updater.service.ts

import prisma from '@/lib/db/prisma'
import { scoreCalculator } from './score-calculator.service'
import { ScoreComponents, ScoreTrigger } from '@/types/scoring'

export class ScoreUpdaterService {
  /**
   * 更新单个节点评分（增量更新）
   */
  async updateNodeScore(nodeId: string, trigger: ScoreTrigger): Promise<void> {
    // 获取当前评分
    const node = await prisma.graphNode.findUnique({
      where: { id: nodeId },
      select: {
        totalScore: true,
        scoreComponents: true,
      },
    })

    if (!node) {
      throw new Error(`Node ${nodeId} not found`)
    }

    const oldScore = node.totalScore
    let oldComponents: ScoreComponents = { marketFundamental: 0, newsSentiment: 0, graphStructure: 0 }

    if (node.scoreComponents) {
      try {
        oldComponents = JSON.parse(node.scoreComponents)
      } catch (e) {
        // Invalid JSON, use defaults
      }
    }

    // 根据触发类型，选择性重算
    let newComponents: ScoreComponents = { ...oldComponents }

    if (trigger === 'news' || trigger === 'manual') {
      newComponents.newsSentiment = await scoreCalculator.calculateNewsScore(nodeId)
    }

    if (trigger === 'market' || trigger === 'manual') {
      newComponents.marketFundamental = await scoreCalculator.calculateMarketScore(nodeId)
    }

    if (trigger === 'structure' || trigger === 'manual') {
      newComponents.graphStructure = await scoreCalculator.calculateGraphScore(nodeId)
    }

    const newScore = newComponents.marketFundamental + newComponents.newsSentiment + newComponents.graphStructure
    const trendIndicator = this.determineTrendIndicator(newScore, oldScore)

    // 更新节点
    await prisma.graphNode.update({
      where: { id: nodeId },
      data: {
        scoreComponents: JSON.stringify(newComponents),
        totalScore: newScore,
        scoreUpdatedAt: new Date(),
        trendIndicator,
      },
    })

    // 保存历史快照
    await this.saveScoreSnapshot(nodeId, newComponents)
  }

  /**
   * 批量更新节点评分
   */
  async batchUpdateScores(nodeIds: string[], trigger: ScoreTrigger): Promise<void> {
    for (const nodeId of nodeIds) {
      try {
        await this.updateNodeScore(nodeId, trigger)
      } catch (error) {
        console.error(`Failed to update score for node ${nodeId}:`, error)
        // Continue with next node
      }
    }
  }

  /**
   * 保存评分历史快照
   */
  async saveScoreSnapshot(nodeId: string, components: ScoreComponents): Promise<void> {
    const totalScore = components.marketFundamental + components.newsSentiment + components.graphStructure
    const today = new Date()
    today.setHours(0, 0, 0, 0)

    // Upsert to handle multiple updates in same day
    await prisma.nodeScoreHistory.upsert({
      where: {
        nodeId_date: {
          nodeId,
          date: today,
        },
      },
      update: {
        totalScore,
        components: JSON.stringify(components),
      },
      create: {
        nodeId,
        date: today,
        totalScore,
        components: JSON.stringify(components),
      },
    })
  }

  /**
   * 判断趋势指示器
   */
  determineTrendIndicator(newScore: number, oldScore: number): 'up' | 'down' | 'stable' {
    const diff = newScore - oldScore

    if (diff > 5) return 'up'
    if (diff < -5) return 'down'
    return 'stable'
  }
}

// Export singleton
export const scoreUpdater = new ScoreUpdaterService()
