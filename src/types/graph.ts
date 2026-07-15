// 知识图谱类型定义

export type NodeType =
  // 层级节点
  | 'index'
  | 'industry_l1'
  | 'industry_l2'
  | 'sub_sector'
  | 'stock'
  // 产业链节点
  | 'chip_design'
  | 'wafer_foundry'
  | 'packaging'
  | 'equipment'
  | 'material'
  | 'eda'
  | 'memory'
  | 'server'
  | 'cooling'
  | 'power'
  | 'pcb'
  | 'networking'
  | 'data_center'
  | 'cloud'
  | 'ai_application'
  | 'terminal_device'
  | 'optical_comm'
  | 'cpo'
  | 'optical_module'
  // 外部驱动节点
  | 'policy'
  | 'macro'
  | 'technology'
  | 'demand'

export type RelationType =
  | 'supply_chain'
  | 'demand_driver'
  | 'competition'
  | 'complement'
  | 'policy_impact'
  | 'tech_enable'
  | 'tech_evolution'
  | 'cost_pressure'
  | 'substitution'
  | 'capital_cycle'
  | 'contain'
  | 'support'

export type GraphChangeAction =
  | 'add_node'
  | 'update_node'
  | 'delete_node'
  | 'add_edge'
  | 'update_edge'
  | 'delete_edge'

export type ChangeSource = 'manual' | 'ai_suggested' | 'data_driven'

export interface GraphNode {
  id: string
  type: NodeType | string
  name: string
  description?: string
  parentId?: string
  level: number
  cyclePos?: string
  momentum?: number
  metadata?: string
  updatedAt: string
  createdAt: string

  // 关联数据
  trackingETFs?: {
    ticker: string
    name: string
    totalAssets: number
    trackingError: number
  }[]

  // API返回的关联数据
  children?: GraphNode[]
  stocks?: {
    id: string
    nodeId: string
    ticker: string
    market: string
    name: string
    relevance: number
    role: string
  }[]
  sourceEdges?: GraphEdge[]
  targetEdges?: GraphEdge[]

  relatedStocks?: {
    ticker: string
    market: 'A' | 'HK' | 'US'
    relevance: number
    role: 'direct' | 'indirect' | 'beneficiary' | 'victim'
  }[]

  status?: {
    cyclePosition: 'upturn' | 'peak' | 'downturn' | 'trough'
    momentum: number
    lastUpdated: string
  }
}

export interface GraphEdge {
  id: string
  sourceId: string
  targetId: string
  relation: RelationType | string
  weight: number
  direction: 'positive' | 'negative'
  lag?: string
  confidence: number
  evidence?: string
  description?: string
  // API可能返回的关联数据
  source?: GraphNode
  target?: GraphNode
}

export interface GraphStock {
  id: string
  nodeId: string
  ticker: string
  market: string
  name: string
  relevance: number
  role: string
}

export interface GraphChangeLog {
  id: string
  nodeId?: string
  edgeId?: string
  action: GraphChangeAction
  before?: string
  after?: string
  reason?: string
  source: ChangeSource
  approved: boolean
  approvedBy?: string
  createdAt: string
}

export interface PropagationPath {
  trigger: {
    event: string
    sourceNode: string
  }
  paths: {
    nodes: string[]
    edges: GraphEdge[]
    totalLag: string
    finalImpact: {
      node: string
      direction: 'positive' | 'negative'
      magnitude: number
      confidence: number
    }
    explanation: string
  }[]
  affectedStocks: {
    ticker: string
    name: string
    impactDirection: 'positive' | 'negative'
    impactReasoning: string
    timeHorizon: string
  }[]
}

export interface GraphMutation {
  id: string
  type: GraphChangeAction
  targetId: string
  before?: Partial<GraphNode | GraphEdge>
  after: Partial<GraphNode | GraphEdge>
  reason: string
  source: ChangeSource
  approved: boolean
  approvedBy?: string
  createdAt: string
}
