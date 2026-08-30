// src/types/industry-graph.ts

export interface Industry {
  id: string
  name: string
  code: string
  description?: string
  version: string
  nodeCount: number
  edgeCount: number
  createdAt: string
  updatedAt: string
}

export interface Stage {
  id: string
  name: string
  code: string
  order: number
  description?: string
  segments: Segment[]
}

export interface Segment {
  id: string
  name: string
  code: string
  order: number
  description?: string
  keyCategories?: string[]
  companies: Company[]
  // ETF/指数匹配结果
  matchedEtfs?: Array<{
    code: string
    name: string
    relevance: number
    reasoning: string
  }>
  matchedIndices?: Array<{
    code: string
    name: string
    relevance: number
    reasoning: string
  }>
  lastMatchedAt?: string
}

export interface Company {
  id: string
  name: string
  nameEn?: string
  ticker?: string
  exchange?: string
  country: string
  marketPosition: 'leader' | 'major' | 'emerging'
  keyProducts?: string[]
  description?: string
}

export interface SwimLaneData {
  industry: Industry
  stages: Stage[]
}

export interface ExplorationTask {
  taskId: string
  industryName: string
  status: 'pending' | 'exploring_structure' | 'structure_ready' | 'exploring_details' | 'completed' | 'failed' | 'structure_reviewing' | 'structure_refining' | 'companies_reviewing' | 'companies_refining' | 'reviewing' | 'refining' | 'writing_to_graph'
  progress: number
  currentStep?: string
  structureYaml?: any
  error?: string
}

export interface ExplorationContext {
  iteration: number
  previous_results: string[]
  identified_gaps: string[]
  search_queries: string[]
}

export interface GraphStats {
  nodes: number
  relationships: number
  companies: number
}

export interface SegmentDetail {
  companies: Array<{
    name: string
    name_en?: string
    ticker?: string
    exchange?: string
    country: string
    market_position: string
    key_products?: string[]
    description?: string
    segment_code?: string
    stage_code?: string
  }>
  relationships: Array<{
    type: string
    from: string
    to: string
    description?: string
    confidence: number
  }>
}

export interface ExplorationResult {
  structure: any
  details: Record<string, SegmentDetail>
  metadata?: {
    total_companies?: number
    total_relationships?: number
  }
  created_at?: string
}

export interface ExtendedTask extends ExplorationTask {
  industryId?: string
  coverage_assessment?: import('./coverage').CoverageAssessment
  exploration_context?: ExplorationContext
  structure_iterations: number
  companies_iterations: number
  review_history: import('./review').ReviewHistory[]
  graph_stats?: GraphStats
  result?: ExplorationResult
  structure?: any
}
