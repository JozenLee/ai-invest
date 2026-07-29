import type { NodeType, RelationType } from '@/types/graph'

// Valid node types from the spec
const NODE_TYPES: NodeType[] = [
  'index', 'industry_l1', 'industry_l2', 'sub_sector', 'stock',
  'chip_design', 'wafer_foundry', 'packaging', 'equipment', 'material',
  'eda', 'memory', 'server', 'cooling', 'power', 'pcb', 'networking',
  'data_center', 'cloud', 'ai_application', 'terminal_device',
  'optical_comm', 'cpo', 'optical_module',
  'policy', 'macro', 'technology', 'demand'
]

// Valid relation types from the spec
const RELATION_TYPES: RelationType[] = [
  'supply_chain', 'demand_driver', 'competition', 'complement',
  'policy_impact', 'tech_enable', 'tech_evolution', 'cost_pressure',
  'substitution', 'capital_cycle', 'contain', 'support'
]

export interface ExtractedEntity {
  name: string
  type: NodeType
  description?: string
  confidence: number  // 0-1
  evidence: string[]
}

export interface ExtractedRelation {
  source: string
  target: string
  relation: RelationType
  weight: number  // 0-1
  direction: 'positive' | 'negative'
  confidence: number  // 0-1
  evidence: string[]
  lag?: string
}

export interface ExtractionResult {
  entities: ExtractedEntity[]
  relations: ExtractedRelation[]
  summary: string
}

// JSON Schema for Claude structured output
export const GRAPH_EXTRACTION_SCHEMA = {
  type: 'object',
  properties: {
    entities: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          name: { type: 'string', minLength: 1, maxLength: 100 },
          type: { type: 'string', enum: NODE_TYPES },
          description: { type: 'string', maxLength: 500 },
          confidence: { type: 'number', minimum: 0, maximum: 1 },
          evidence: {
            type: 'array',
            items: { type: 'string', maxLength: 200 },
            minItems: 1
          }
        },
        required: ['name', 'type', 'confidence', 'evidence']
      }
    },
    relations: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          source: { type: 'string', minLength: 1 },
          target: { type: 'string', minLength: 1 },
          relation: { type: 'string', enum: RELATION_TYPES },
          weight: { type: 'number', minimum: 0, maximum: 1 },
          direction: { type: 'string', enum: ['positive', 'negative'] },
          confidence: { type: 'number', minimum: 0, maximum: 1 },
          evidence: {
            type: 'array',
            items: { type: 'string', maxLength: 200 },
            minItems: 1
          },
          lag: { type: 'string', maxLength: 50 }
        },
        required: ['source', 'target', 'relation', 'weight', 'direction', 'confidence', 'evidence']
      }
    },
    summary: { type: 'string', minLength: 10, maxLength: 1000 }
  },
  required: ['entities', 'relations', 'summary']
}

// Validation helper
export function validateExtractionResult(data: unknown): {
  success: boolean
  data?: ExtractionResult
  error?: string
} {
  try {
    // Type guard checks
    if (!data || typeof data !== 'object') {
      return { success: false, error: 'Data must be an object' }
    }

    const obj = data as any

    if (!Array.isArray(obj.entities) || !Array.isArray(obj.relations)) {
      return { success: false, error: 'entities and relations must be arrays' }
    }

    // Validate entities
    for (const entity of obj.entities) {
      if (!entity.name || typeof entity.name !== 'string') {
        return { success: false, error: 'Entity name required' }
      }
      if (!NODE_TYPES.includes(entity.type)) {
        return { success: false, error: `Invalid entity type: ${entity.type}` }
      }
      if (typeof entity.confidence !== 'number' || entity.confidence < 0 || entity.confidence > 1) {
        return { success: false, error: 'Confidence must be 0-1' }
      }
      if (!Array.isArray(entity.evidence) || entity.evidence.length === 0) {
        return { success: false, error: 'Evidence required' }
      }
    }

    // Validate relations
    for (const relation of obj.relations) {
      if (!relation.source || !relation.target) {
        return { success: false, error: 'Relation source/target required' }
      }
      if (!RELATION_TYPES.includes(relation.relation)) {
        return { success: false, error: `Invalid relation type: ${relation.relation}` }
      }
      if (typeof relation.weight !== 'number' || relation.weight < 0 || relation.weight > 1) {
        return { success: false, error: 'Weight must be 0-1' }
      }
      if (!['positive', 'negative'].includes(relation.direction)) {
        return { success: false, error: 'Direction must be positive/negative' }
      }
      if (typeof relation.confidence !== 'number' || relation.confidence < 0 || relation.confidence > 1) {
        return { success: false, error: 'Confidence must be 0-1' }
      }
    }

    if (!obj.summary || typeof obj.summary !== 'string') {
      return { success: false, error: 'Summary required' }
    }

    return { success: true, data: obj as ExtractionResult }
  } catch (error) {
    return { success: false, error: String(error) }
  }
}
