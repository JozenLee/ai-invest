export interface StepContext {
  runId: string
  stepId: string
  input: Record<string, any> // 来自上一步或初始参数
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
