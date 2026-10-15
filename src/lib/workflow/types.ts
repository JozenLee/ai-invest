/* eslint-disable @typescript-eslint/no-explicit-any -- Workflow payloads are heterogeneous and validated at module port boundaries. */
export interface StepContext {
  runId: string
  stepId: string
  /** Persisted workflow execution attempt; request retries are scoped beneath it. */
  attemptNumber?: number
  input: Record<string, any> // 来自上一步或初始参数
  /** 由工作流端口绑定得到的直接输入；新模块应优先使用此字段。 */
  inputs?: ReadonlyMap<string, any>
  /** @deprecated 旧步骤兼容层。包含整个轮次的当前产物。 */
  artifacts: Map<string, any> // 已加载的产物
  updateProgress: (current: number, total: number, message?: string) => Promise<void>
  saveArtifact: (key: string, data: any, type?: 'REFERENCE' | 'DATA' | 'FILE') => Promise<void>
}

export interface StepDefinition {
  name: string
  description: string
  dependencies: string[] // 依赖的步骤名称
  execute: (context: StepContext) => Promise<void>
  estimatedDuration?: number // 预估时长(ms)
}

export type WorkflowNodeCategory = 'control' | 'data' | 'quality' | 'rule' | 'ai' | 'report'
export type WorkflowVisibility = 'public' | 'private' | 'system'

export interface WorkflowPortDefinition {
  id: string
  label: string
  artifactKey: string
  schemaId: string
  schemaVersion: number
  required: boolean
  sourceNodeId?: string
  description?: string
  confidentiality?: 'public' | 'private' | 'restricted'
}

export interface WorkflowMethodField {
  id: string
  label: string
  type: 'select' | 'number' | 'boolean'
  description?: string
  options?: Array<{ label: string; value: string }>
  min?: number
  max?: number
  step?: number
  defaultValue: string | number | boolean
}

export interface WorkflowMethodDefinition {
  id: string
  version: string
  label: string
  description: string
  fields: WorkflowMethodField[]
}

export interface WorkflowNodeDefinition {
  id: string
  version: string
  title: string
  description: string
  phase: string
  category: WorkflowNodeCategory
  visibility: WorkflowVisibility
  inputs: WorkflowPortDefinition[]
  outputs: WorkflowPortDefinition[]
  methods: WorkflowMethodDefinition[]
  defaultMethodId: string
  configurable: boolean
  estimatedDuration?: number
  executionPolicy?: {
    after?: string[]
    concurrencyGroup?: string
    maxAttempts?: number
    timeoutMs?: number
  }
}

export interface WorkflowEdgeDefinition {
  id: string
  sourceNodeId: string
  sourcePortId: string
  targetNodeId: string
  targetPortId: string
  artifactKey: string
  schemaId: string
  schemaVersion: number
  required: boolean
}

export interface WorkflowPhaseDefinition {
  id: string
  title: string
  caption: string
  order: number
}

export interface WorkflowDefinition {
  id: string
  version: string
  title: string
  description: string
  phases: WorkflowPhaseDefinition[]
  nodes: WorkflowNodeDefinition[]
  edges: WorkflowEdgeDefinition[]
}

export interface WorkflowNodeConfig {
  methodId: string
  parameters: Record<string, string | number | boolean>
}

export enum ArtifactType {
  REFERENCE = 'REFERENCE', // 引用已有数据
  DATA = 'DATA', // 新数据
  FILE = 'FILE' // 文件路径
}

export enum ExecutionStatus {
  PENDING = 'PENDING',
  RUNNING = 'RUNNING',
  COMPLETED = 'COMPLETED',
  FAILED = 'FAILED',
  PAUSED = 'PAUSED'
}

export enum StepStatus {
  PENDING = 'PENDING',
  RUNNING = 'RUNNING',
  COMPLETED = 'COMPLETED',
  FAILED = 'FAILED',
  SKIPPED = 'SKIPPED'
}
