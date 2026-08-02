// src/types/industry-graph.ts

export interface Industry {
  id: string
  name: string
  code: string
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
  status: 'pending' | 'exploring_structure' | 'structure_ready' | 'exploring_details' | 'completed' | 'failed'
  progress: number
  currentStep?: string
  structureYaml?: any
  error?: string
}
