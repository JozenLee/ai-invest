// src/types/graph-diff.ts

export interface GraphDiff {
  summary: DiffSummary
  changes: Change[]
}

export interface DiffSummary {
  totalChanges: number
  addedNodes: number
  removedNodes: number
  modifiedNodes: number
  addedEdges: number
  removedEdges: number
}

export interface Change {
  id: string
  type: 'node_added' | 'node_removed' | 'node_modified' | 'edge_added' | 'edge_removed'
  category: string
  path: string
  description: string
  data?: any
  propertyDiffs?: PropertyDiff[]
  confidence?: number
}

export interface PropertyDiff {
  property: string
  oldValue: any
  newValue: any
}

export interface GraphUpdateReview {
  id: string
  industryId: string
  industryName: string
  oldVersion: string
  newVersion: string
  summary: DiffSummary
  changes: Change[]
  status: 'pending' | 'approved' | 'rejected' | 'partial'
  createdAt: string
  reviewedAt?: string
}
