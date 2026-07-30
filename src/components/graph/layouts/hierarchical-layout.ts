/**
 * 分层布局算法
 * Phase 3: 可视化升级
 *
 * 算法步骤：
 * 1. 按节点level分层
 * 2. 每层内按type聚类
 * 3. 计算初始位置（层间距均匀、层内间距合理）
 * 4. 应用轻度力导向优化
 */

export interface GraphNode {
  id: string
  name: string
  type: string
  level: number
  x?: number
  y?: number
}

export interface GraphEdge {
  sourceId: string
  targetId: string
  relation: string
  weight: number
}

export interface LayoutConfig {
  width: number
  height: number
  levelSpacing: number // 层间距
  nodeSpacing: number // 节点间距
  iterations: number // 力导向迭代次数
  clusterPadding: number // 聚类间距
}

const DEFAULT_CONFIG: LayoutConfig = {
  width: 1200,
  height: 800,
  levelSpacing: 150,
  nodeSpacing: 80,
  iterations: 100,
  clusterPadding: 50
}

export class HierarchicalLayout {
  private config: LayoutConfig

  constructor(config?: Partial<LayoutConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...config }
  }

  /**
   * 计算分层布局
   */
  layout(nodes: GraphNode[], edges: GraphEdge[]): GraphNode[] {
    // 1. 按level分组
    const levels = this.groupByLevel(nodes)

    // 2. 每层内按type聚类
    const clusteredLevels = levels.map(level => this.clusterByType(level))

    // 3. 计算初始位置
    const positioned = this.calculateInitialPositions(clusteredLevels)

    // 4. 力导向优化
    const optimized = this.applyForceDirected(positioned, edges)

    return optimized
  }

  /**
   * 按level分组
   */
  private groupByLevel(nodes: GraphNode[]): GraphNode[][] {
    const levelMap = new Map<number, GraphNode[]>()

    for (const node of nodes) {
      const level = node.level
      if (!levelMap.has(level)) {
        levelMap.set(level, [])
      }
      levelMap.get(level)!.push(node)
    }

    // 按level排序
    const sortedLevels = Array.from(levelMap.entries())
      .sort((a, b) => a[0] - b[0])
      .map(([_, nodes]) => nodes)

    return sortedLevels
  }

  /**
   * 按type聚类
   */
  private clusterByType(nodes: GraphNode[]): Map<string, GraphNode[]> {
    const clusters = new Map<string, GraphNode[]>()

    for (const node of nodes) {
      if (!clusters.has(node.type)) {
        clusters.set(node.type, [])
      }
      clusters.get(node.type)!.push(node)
    }

    return clusters
  }

  /**
   * 计算初始位置
   */
  private calculateInitialPositions(
    clusteredLevels: Map<string, GraphNode[]>[]
  ): GraphNode[] {
    const { width, height, levelSpacing, nodeSpacing, clusterPadding } = this.config
    const positioned: GraphNode[] = []

    const numLevels = clusteredLevels.length
    const startY = 50 // 顶部留白

    clusteredLevels.forEach((clusters, levelIndex) => {
      // Y坐标：按level均匀分布
      const y = startY + levelIndex * levelSpacing

      // 计算这一层的总宽度
      const clusterArray = Array.from(clusters.values())
      const totalWidth = clusterArray.reduce((sum, cluster) => {
        return sum + cluster.length * nodeSpacing + clusterPadding
      }, 0) - clusterPadding

      // X起始位置：居中
      let currentX = (width - totalWidth) / 2

      // 为每个聚类分配位置
      clusterArray.forEach(cluster => {
        const clusterWidth = cluster.length * nodeSpacing
        const clusterStartX = currentX

        cluster.forEach((node, index) => {
          positioned.push({
            ...node,
            x: clusterStartX + index * nodeSpacing,
            y
          })
        })

        currentX += clusterWidth + clusterPadding
      })
    })

    return positioned
  }

  /**
   * 力导向优化
   */
  private applyForceDirected(
    nodes: GraphNode[],
    edges: GraphEdge[]
  ): GraphNode[] {
    const { iterations, nodeSpacing } = this.config

    // 创建节点映射
    const nodeMap = new Map(nodes.map(n => [n.id, { ...n }]))

    // 构建邻接表
    const adjacency = new Map<string, Set<string>>()
    for (const edge of edges) {
      if (!adjacency.has(edge.sourceId)) {
        adjacency.set(edge.sourceId, new Set())
      }
      if (!adjacency.has(edge.targetId)) {
        adjacency.set(edge.targetId, new Set())
      }
      adjacency.get(edge.sourceId)!.add(edge.targetId)
      adjacency.get(edge.targetId)!.add(edge.sourceId)
    }

    // 力导向迭代
    for (let iter = 0; iter < iterations; iter++) {
      const forces = new Map<string, { fx: number, fy: number }>()

      // 初始化力
      for (const node of nodeMap.values()) {
        forces.set(node.id, { fx: 0, fy: 0 })
      }

      // 1. 斥力（避免节点重叠）
      const nodesArray = Array.from(nodeMap.values())
      for (let i = 0; i < nodesArray.length; i++) {
        for (let j = i + 1; j < nodesArray.length; j++) {
          const n1 = nodesArray[i]
          const n2 = nodesArray[j]

          const dx = n2.x! - n1.x!
          const dy = n2.y! - n1.y!
          const dist = Math.sqrt(dx * dx + dy * dy)

          if (dist < nodeSpacing && dist > 0) {
            const force = (nodeSpacing - dist) / dist
            const fx = force * dx * 0.1
            const fy = force * dy * 0.1

            forces.get(n1.id)!.fx -= fx
            forces.get(n1.id)!.fy -= fy
            forces.get(n2.id)!.fx += fx
            forces.get(n2.id)!.fy += fy
          }
        }
      }

      // 2. 引力（连接的节点相互吸引）
      for (const edge of edges) {
        const source = nodeMap.get(edge.sourceId)
        const target = nodeMap.get(edge.targetId)

        if (!source || !target) continue

        const dx = target.x! - source.x!
        const dy = target.y! - source.y!
        const dist = Math.sqrt(dx * dx + dy * dy)

        if (dist > nodeSpacing * 1.5) {
          const force = (dist - nodeSpacing * 1.5) / dist * edge.weight
          const fx = force * dx * 0.05
          const fy = force * dy * 0.05

          forces.get(source.id)!.fx += fx
          forces.get(source.id)!.fy += fy
          forces.get(target.id)!.fx -= fx
          forces.get(target.id)!.fy -= fy
        }
      }

      // 3. 层级约束（Y坐标保持在原层级附近）
      for (const node of nodeMap.values()) {
        const initialY = nodes.find(n => n.id === node.id)?.y || node.y!
        const dy = initialY - node.y!
        forces.get(node.id)!.fy += dy * 0.2 // 强约束
      }

      // 应用力
      for (const node of nodeMap.values()) {
        const force = forces.get(node.id)!
        node.x! += force.fx
        node.y! += force.fy
      }
    }

    return Array.from(nodeMap.values())
  }
}

/**
 * 辅助函数：快速布局
 */
export function hierarchicalLayout(
  nodes: GraphNode[],
  edges: GraphEdge[],
  config?: Partial<LayoutConfig>
): GraphNode[] {
  const layout = new HierarchicalLayout(config)
  return layout.layout(nodes, edges)
}

/**
 * 预定义配置
 */
export const LAYOUT_PRESETS = {
  compact: {
    levelSpacing: 100,
    nodeSpacing: 60,
    clusterPadding: 30,
    iterations: 50
  },
  spacious: {
    levelSpacing: 200,
    nodeSpacing: 100,
    clusterPadding: 80,
    iterations: 100
  },
  default: DEFAULT_CONFIG
}
