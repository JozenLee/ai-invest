import Anthropic from '@anthropic-ai/sdk'
import { prisma } from '@/lib/db'

/**
 * 图谱状态更新服务
 * Phase 2: 定期更新节点的动量和周期位置
 */

interface NodeStateUpdate {
  nodeId: string
  oldMomentum: number | null
  newMomentum: number
  oldCyclePos: string | null
  newCyclePos: string
  reasoning: string
}

export class GraphStateUpdaterService {
  /**
   * 更新所有节点的状态
   */
  async updateAllNodeStates(): Promise<{
    total: number
    updated: number
    failed: number
    updates: NodeStateUpdate[]
  }> {
    const results = {
      total: 0,
      updated: 0,
      failed: 0,
      updates: [] as NodeStateUpdate[]
    }

    // 获取所有非指数节点（指数节点不需要周期判断）
    const nodes = await prisma.graphNode.findMany({
      where: {
        type: { not: 'index' }
      },
      include: {
        newsLinks: {
          orderBy: { createdAt: 'desc' },
          take: 30 // 最近30条新闻
        }
      }
    })

    results.total = nodes.length

    for (const node of nodes) {
      try {
        const update = await this.updateNodeState(node)
        results.updates.push(update)
        results.updated++
      } catch (error) {
        console.error(`Failed to update node ${node.id}:`, error)
        results.failed++
      }
    }

    return results
  }

  /**
   * 更新单个节点状态
   */
  async updateNodeState(node: any): Promise<NodeStateUpdate> {
    // 计算动量
    const newMomentum = this.calculateMomentum(node)

    // 判断周期位置
    const newCyclePos = this.determineCyclePosition(
      node.momentum || 0,
      newMomentum,
      node.cyclePos
    )

    // 更新数据库
    await prisma.graphNode.update({
      where: { id: node.id },
      data: {
        momentum: newMomentum,
        cyclePos: newCyclePos
      }
    })

    return {
      nodeId: node.id,
      oldMomentum: node.momentum,
      newMomentum,
      oldCyclePos: node.cyclePos,
      newCyclePos,
      reasoning: this.generateReasoning(node, newMomentum, newCyclePos)
    }
  }

  /**
   * 计算节点动量 (-100 ~ +100)
   */
  private calculateMomentum(node: any): number {
    const weights = {
      newsHeat: 0.4,
      sentimentTrend: 0.3,
      marketMomentum: 0.3
    }

    // 1. 新闻热度变化
    const newsHeat = this.calculateNewsHeat(node)

    // 2. 情绪趋势
    const sentimentTrend = this.calculateSentimentTrend(node)

    // 3. 市场动量（简化版，实际需要结合市场数据）
    const marketMomentum = 0 // TODO: 集成市场数据

    const momentum =
      newsHeat * weights.newsHeat +
      sentimentTrend * weights.sentimentTrend +
      marketMomentum * weights.marketMomentum

    // 限制在 -100 ~ +100
    return Math.max(-100, Math.min(100, momentum))
  }

  /**
   * 计算新闻热度 (-100 ~ +100)
   */
  private calculateNewsHeat(node: any): number {
    const count7d = node.newsCount7d || 0
    const count30d = node.newsCount30d || 0

    if (count30d === 0) return 0

    // 计算7天与30天的比率（判断趋势）
    const ratio = count7d / (count30d / 4.3) // 30天平均每周数量

    // ratio > 1 表示加速，< 1 表示减速
    // 映射到 -100 ~ +100
    if (ratio > 2) return 100 // 显著加速
    if (ratio > 1.5) return 70
    if (ratio > 1.2) return 40
    if (ratio > 0.8) return 0 // 稳定
    if (ratio > 0.5) return -40
    if (ratio > 0.3) return -70
    return -100 // 显著减速
  }

  /**
   * 计算情绪趋势 (-100 ~ +100)
   */
  private calculateSentimentTrend(node: any): number {
    const sentimentScore = node.sentimentScore || 0

    // sentimentScore 在 -1 ~ +1，映射到 -100 ~ +100
    return sentimentScore * 100
  }

  /**
   * 判断周期位置
   */
  private determineCyclePosition(
    oldMomentum: number,
    newMomentum: number,
    oldCyclePos: string | null
  ): string {
    const momentum = newMomentum
    const isIncreasing = newMomentum > oldMomentum

    // 周期判断规则
    if (momentum > 60 && isIncreasing) {
      return 'upturn' // 上升期
    } else if (momentum > 60 && !isIncreasing) {
      return 'peak' // 高位
    } else if (momentum < -40 && !isIncreasing) {
      return 'downturn' // 下降期
    } else if (momentum < -40 && isIncreasing) {
      return 'trough' // 底部
    } else {
      // 保持原状态或设为中性
      return oldCyclePos || 'neutral'
    }
  }

  /**
   * 生成推理说明
   */
  private generateReasoning(node: any, momentum: number, cyclePos: string): string {
    const parts: string[] = []

    // 新闻热度
    if (node.newsCount7d > 0) {
      parts.push(`7天内${node.newsCount7d}条新闻`)
    }

    // 情绪
    if (node.sentimentScore) {
      const sentiment =
        node.sentimentScore > 0.3 ? '偏正面' :
        node.sentimentScore < -0.3 ? '偏负面' : '中性'
      parts.push(`情绪${sentiment}(${node.sentimentScore.toFixed(2)})`)
    }

    // 动量
    parts.push(`动量${momentum.toFixed(0)}`)

    // 周期
    const cycleLabel = {
      upturn: '上升期',
      peak: '高位',
      downturn: '下降期',
      trough: '底部',
      neutral: '中性'
    }[cyclePos] || cyclePos

    parts.push(`周期${cycleLabel}`)

    return parts.join(', ')
  }

  /**
   * 批量更新指定节点
   */
  async updateNodes(nodeIds: string[]): Promise<NodeStateUpdate[]> {
    const updates: NodeStateUpdate[] = []

    for (const nodeId of nodeIds) {
      try {
        const node = await prisma.graphNode.findUnique({
          where: { id: nodeId },
          include: {
            newsLinks: {
              orderBy: { createdAt: 'desc' },
              take: 30
            }
          }
        })

        if (!node) {
          console.warn(`Node not found: ${nodeId}`)
          continue
        }

        const update = await this.updateNodeState(node)
        updates.push(update)
      } catch (error) {
        console.error(`Failed to update node ${nodeId}:`, error)
      }
    }

    return updates
  }
}

// 导出单例
export const graphStateUpdaterService = new GraphStateUpdaterService()
