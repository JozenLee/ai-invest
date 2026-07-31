// src/types/scoring.ts

// 评分组成部分
export interface ScoreComponents {
  marketFundamental: number  // 市场基本面 0-50
  newsSentiment: number      // 新闻舆情面 0-30
  graphStructure: number     // 图谱结构面 0-20
}

// 节点评分详情
export interface NodeScoreDetail {
  nodeId: string
  nodeName: string
  subGraphId: string
  subGraphName: string
  totalScore: number         // 0-100
  scoreComponents: ScoreComponents
  trendIndicator: 'up' | 'down' | 'stable'
  scoreUpdatedAt: Date | null
  relatedETFs: Array<{
    ticker: string
    name: string
  }>
  scoreHistory: Array<{
    date: string
    score: number
  }>
}

// 节点评分DTO（用于列表）
export interface NodeScoreDTO {
  nodeId: string
  nodeName: string
  subGraphId: string
  subGraphName: string
  totalScore: number
  scoreChange7d: number      // 7日评分变化
  trendIndicator: 'up' | 'down' | 'stable'
  relatedETFs: string[]      // ETF代码数组
}

// 子图健康度
export interface SubGraphHealth {
  subGraphId: string
  name: string
  category: string
  avgScore: number
  nodeCount: number
  activeNodeCount: number    // 评分>60的节点数
  signalCount: number        // 活跃信号数
}

// 跨行业传导热力图数据点
export interface CrossSectorHeatmapData {
  sourceGraph: string
  targetGraph: string
  propagationCount: number   // 传导次数
}

// Dashboard图谱洞察数据
export interface GraphInsightsData {
  topRisingNodes: NodeScoreDTO[]
  subGraphHealth: SubGraphHealth[]
  crossSectorHeatmap: CrossSectorHeatmapData[]
  lastUpdated: string
}

// 评分更新触发类型
export type ScoreTrigger = 'news' | 'market' | 'structure' | 'manual'

// 评分计算输入
export interface ScoreCalculationInput {
  nodeId: string
  trigger?: ScoreTrigger
  forceRecalculate?: boolean  // 强制全量重算
}
