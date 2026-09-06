import { prisma } from '@/lib/db'
import type { StepDefinition, StepContext, ArtifactType } from './types'

export class ExecutionOrchestrator {
  constructor(
    private workflowId: string,
    private steps: StepDefinition[]
  ) {}

  /**
   * 创建新的执行轮次
   */
  async createRun(metadata?: any): Promise<string> {
    // 清理旧轮次
    await this.cleanupOldRuns()

    const run = await prisma.executionRun.create({
      data: {
        workflowId: this.workflowId,
        status: 'PENDING',
        metadata: metadata ? JSON.stringify(metadata) : null,
        steps: {
          create: this.steps.map((step, index) => ({
            stepName: step.name,
            stepIndex: index,
            status: 'PENDING'
          }))
        }
      },
      include: { steps: true }
    })

    return run.id
  }

  /**
   * 执行完整工作流
   */
  async executeAll(runId: string): Promise<void> {
    await this.updateRunStatus(runId, 'RUNNING')

    try {
      await this.applyConditionalSteps(runId)
      for (const step of this.steps) {
        await this.executeStep(runId, step.name)
      }

      await this.updateRunStatus(runId, 'COMPLETED')
    } catch (error) {
      await this.updateRunStatus(runId, 'FAILED', String(error))
      throw error
    }
  }

  /**
   * 执行单个步骤
   */
  async executeStep(runId: string, stepName: string): Promise<void> {
    const stepDef = this.steps.find((s) => s.name === stepName)
    if (!stepDef) throw new Error(`Step ${stepName} not found`)

    const stepRecord = await prisma.executionStep.findUnique({
      where: { runId_stepName: { runId, stepName } },
      include: { artifacts: true }
    })

    if (!stepRecord) throw new Error(`Step record not found`)
    if (stepRecord.status === 'COMPLETED' || stepRecord.status === 'SKIPPED') return // 已完成或条件跳过

    // 检查依赖
    await this.checkDependencies(runId, stepDef.dependencies)

    // 更新状态为运行中
    await prisma.executionStep.update({
      where: { id: stepRecord.id },
      data: { status: 'RUNNING', startedAt: new Date(), completedAt: null, error: null }
    })

    const startTime = Date.now()

    try {
      // 加载依赖步骤的产物
      const artifacts = await this.loadArtifacts(runId, stepDef.dependencies)

      // 构建执行上下文
      const context: StepContext = {
        runId,
        stepId: stepRecord.id,
        input: await this.loadInput(runId),
        artifacts,
        updateProgress: async (current, total, message) => {
          await prisma.executionStep.update({
            where: { id: stepRecord.id },
            data: {
              progress: JSON.stringify({ current, total, message })
            }
          })
        },
        saveArtifact: async (key, data, type: 'REFERENCE' | 'DATA' | 'FILE' = 'DATA') => {
          await this.saveArtifact(stepRecord.id, key, data, type)
        }
      }

      const snapshot = artifacts.get('research-snapshot')
      const projection = snapshot?.projections?.[stepName]
      if (this.workflowId === 'comprehensive-analysis' && stepName !== 'freeze-research' && !snapshot) {
        throw new Error('该轮次没有冻结的研究证据，请新建分析；不使用当前数据改写旧轮次')
      }
      if (projection) {
        for (const [key, value] of Object.entries(projection)) await context.saveArtifact(key, value, 'DATA')
        await context.updateProgress(1, 1, `读取冻结证据 ${snapshot.asOf}`)
      } else {
        await stepDef.execute(context)
      }

      // 标记完成
      const duration = Date.now() - startTime
      await prisma.executionStep.update({
        where: { id: stepRecord.id },
        data: {
          status: 'COMPLETED',
          completedAt: new Date(),
          duration
        }
      })
    } catch (error) {
      await prisma.executionStep.update({
        where: { id: stepRecord.id },
        data: {
          status: 'FAILED',
          error: String(error),
          completedAt: new Date()
        }
      })
      throw error
    }
  }

  /**
   * 断点续执行：从失败的步骤开始
   */
  async resume(runId: string): Promise<void> {
    const run = await prisma.executionRun.findUnique({
      where: { id: runId },
      include: { steps: { orderBy: { stepIndex: 'asc' } } }
    })

    if (!run) throw new Error('Run not found')
    if (run.status === 'COMPLETED') return
    if (run.steps.some(step => step.status === 'RUNNING')) throw new Error('尚有执行中的步骤，请等待完成或由后台恢复中断任务')

    await this.updateRunStatus(runId, 'RUNNING')

    try {
      await this.applyConditionalSteps(runId)
      // 从第一个未完成的步骤开始执行
      for (const stepRecord of run.steps) {
        if (stepRecord.status === 'PENDING' || stepRecord.status === 'FAILED') {
          await this.executeStep(runId, stepRecord.stepName)
        }
      }

      await this.updateRunStatus(runId, 'COMPLETED')
    } catch (error) {
      await this.updateRunStatus(runId, 'FAILED', String(error))
      throw error
    }
  }

  /**
   * 执行下一步（单步执行）
   */
  async executeNext(runId: string): Promise<{ hasNext: boolean; nextStep?: string }> {
    const run = await prisma.executionRun.findUnique({
      where: { id: runId },
      include: { steps: { orderBy: { stepIndex: 'asc' } } }
    })

    if (!run) throw new Error('Run not found')

    await this.applyConditionalSteps(runId)
    const refreshedRun = await prisma.executionRun.findUnique({
      where: { id: runId },
      include: { steps: { orderBy: { stepIndex: 'asc' } } }
    })
    if (!refreshedRun) throw new Error('Run not found')
    if (refreshedRun.steps.some(step => step.status === 'RUNNING')) throw new Error('已有步骤执行中，请勿重复启动')

    const nextStep = refreshedRun.steps.find(
      (s) => s.status === 'PENDING' || s.status === 'FAILED'
    )

    if (!nextStep) {
      await this.updateRunStatus(runId, 'COMPLETED')
      return { hasNext: false }
    }

    await this.updateRunStatus(runId, 'RUNNING')
    try {
      await this.executeStep(runId, nextStep.stepName)
    } catch (error) {
      await this.updateRunStatus(runId, 'FAILED', String(error))
      throw error
    }

    const remainingSteps = await prisma.executionStep.findMany({
      where: {
        runId,
        stepIndex: { gt: nextStep.stepIndex },
        status: { notIn: ['COMPLETED', 'SKIPPED'] }
      },
      orderBy: { stepIndex: 'asc' }
    })

    if (remainingSteps.length === 0) {
      await this.updateRunStatus(runId, 'COMPLETED')
      return { hasNext: false }
    }

    // A single-step run is still actionable; keep it out of RUNNING so the
    // client can enable the next-step controls after the request completes.
    await this.updateRunStatus(runId, 'PENDING')

    return {
      hasNext: true,
      nextStep: remainingSteps[0].stepName
    }
  }

  // --- 辅助方法 ---

  private async checkDependencies(
    runId: string,
    dependencies: string[]
  ): Promise<void> {
    if (dependencies.length === 0) return

    const steps = await prisma.executionStep.findMany({
      where: {
        runId,
        stepName: { in: dependencies }
      }
    })

    const incomplete = steps.filter((s) => !['COMPLETED', 'SKIPPED'].includes(s.status))
    const missing = dependencies.filter(name => !steps.some(step => step.stepName === name))
    if (missing.length) throw new Error(`Missing dependency steps: ${missing.join(', ')}；请新建包含最新流程的轮次`)
    if (incomplete.length > 0) {
      throw new Error(
        `Dependencies not met: ${incomplete.map((s) => s.stepName).join(', ')}`
      )
    }
  }

  private async applyConditionalSteps(runId: string): Promise<void> {
    // Subscription analysis always reads holdings for coverage, even when the
    // user chooses the graph intersection as the company candidate set.
    if (this.workflowId === 'comprehensive-analysis') {
      const input=await this.loadInput(runId)
      if(input.rulesOnly){
        const optional=['market-analysis','news-analysis','company-analysis','portfolio-analysis','industry-overview','investment-advice','social-report']
        const steps=await prisma.executionStep.findMany({where:{runId,stepName:{in:optional},status:'PENDING'}})
        for(const step of steps){
          await this.saveArtifact(step.id,step.stepName,step.stepName==='social-report'||step.stepName==='portfolio-analysis'?null:{analysis:'本轮为本地规则复核，未调用AI；请查看规则条件与证据变化。'},'DATA')
          if(step.stepName==='social-report')await this.saveArtifact(step.id,'social-report-status',{status:'not-requested',message:'本地规则复核，不生成AI一页版'},'DATA')
          await prisma.executionStep.update({where:{id:step.id},data:{status:'SKIPPED',completedAt:new Date()}})
        }
      }
      return
    }
    const run = await prisma.executionRun.findUnique({ where: { id: runId }, select: { metadata: true } })
    const metadata = run?.metadata ? JSON.parse(run.metadata) : {}
    const source = metadata.companySource === 'graph' ? 'graph' : 'etf'
    const stepName = source === 'graph' ? 'fetch-etf-holdings' : 'fetch-companies'
    await prisma.executionStep.updateMany({
      where: { runId, stepName, status: 'PENDING' },
      data: { status: 'SKIPPED', completedAt: new Date() }
    })
  }

  private async loadArtifacts(
    runId: string,
    dependencySteps: string[]
  ): Promise<Map<string, any>> {
    const artifacts = new Map()
    // Steps commonly need both direct dependency outputs and shared inputs
    // produced earlier in the workflow (for example industry-info and ETF
    // bindings). Load all artifacts in execution order so the context is
    // complete while preserving deterministic overwrite behavior.
    const steps = await prisma.executionStep.findMany({
      where: { runId },
      orderBy: { stepIndex: 'asc' },
      include: { artifacts: true }
    })

    for (const step of steps) {
      for (const artifact of step.artifacts) {
        let data: any

        if (artifact.artifactType === 'REFERENCE') {
          // 解析引用并加载数据
          data = await this.resolveReference(artifact.data!)
        } else if (artifact.artifactType === 'DATA') {
          try {
            data = JSON.parse(artifact.data || 'null')
          } catch {
            data = artifact.data
          }
        } else if (artifact.artifactType === 'FILE') {
          // 从文件加载
          data = artifact.fileUrl
        }

        artifacts.set(artifact.artifactKey, data)
      }
    }

    return artifacts
  }

  private async resolveReference(ref: string): Promise<any> {
    // 空引用直接返回空字符串
    if (!ref || ref.trim() === '') {
      return ''
    }

    // 解析引用格式，如 "etf:159995" -> 查询ETF表
    const [type, id] = ref.split(':')

    switch (type) {
      case 'industry':
        return prisma.graphNode.findUnique({
          where: { id },
          include: {
            etfBindings: true,
            indexBindings: true
          }
        })
      case 'company':
        return prisma.graphStock.findUnique({ where: { id } })
      case 'etf-list':
        // 多个ETF代码，用逗号分隔
        const codes = id.split(',')
        return prisma.eTFDaily.findMany({
          where: { ticker: { in: codes } },
          orderBy: { date: 'desc' },
          distinct: ['ticker']
        })
      default:
        // Some references (for example report-id) are opaque identifiers.
        return ref
    }
  }

  private async loadInput(runId: string): Promise<any> {
    const run = await prisma.executionRun.findUnique({
      where: { id: runId },
      select: { metadata: true }
    })

    return run?.metadata ? JSON.parse(run.metadata) : {}
  }

  private async saveArtifact(
    stepId: string,
    key: string,
    data: any,
    type: string
  ): Promise<void> {
    const serialized = JSON.stringify(data)
    const size = Buffer.byteLength(serialized, 'utf8')

    await prisma.stepArtifact.upsert({
      where: { stepId_artifactKey: { stepId, artifactKey: key } },
      create: {
        stepId,
        artifactKey: key,
        artifactType: type,
        dataType: 'JSON',
        data: serialized,
        size
      },
      update: {
        data: serialized,
        size
      }
    })
  }

  private async updateRunStatus(
    runId: string,
    status: string,
    error?: string
  ): Promise<void> {
    await prisma.executionRun.update({
      where: { id: runId },
      data: {
        status,
        error: error ?? null,
        completedAt:
          status === 'COMPLETED' || status === 'FAILED' ? new Date() : undefined
      }
    })
  }

  private async cleanupOldRuns(): Promise<void> {
    const runs = await prisma.executionRun.findMany({
      where: { workflowId: this.workflowId, status: 'FAILED', steps: { none: { artifacts: { some: { artifactKey: 'report-id' } } } } },
      orderBy: { startedAt: 'desc' },
      select: { id: true }
    })

    if (runs.length >= 50) {
      const toDelete = runs.slice(49).map((r) => r.id)
      await prisma.executionRun.deleteMany({
        where: { id: { in: toDelete } }
      })
    }
  }

  /**
   * 获取执行详情
   */
  async getRunDetails(runId: string, compact = false) {
    return prisma.executionRun.findUnique({
      where: { id: runId },
      include: {
        steps: {
          orderBy: { stepIndex: 'asc' },
          include: {
            artifacts: {
              ...(compact ? {where:{artifactKey:{in:['report-id','data-quality','research-evaluation','market-analysis','news-analysis','company-analysis','industry-overview','investment-advice','social-report-status']}}} : {}),
              select: {
                artifactKey: true,
                artifactType: true,
                data: true,
                size: true,
                createdAt: true
              }
            }
          }
        }
      }
    })
  }

  /**
   * 获取轮次列表
   */
  async listRuns(limit: number = 50, industryId?: string) {
    const runs = await prisma.executionRun.findMany({
      where: { workflowId: this.workflowId, ...(industryId ? {metadata:{contains:JSON.stringify({industryId}).slice(1,-1)}} : {}) },
      orderBy: { startedAt: 'desc' },
      take: limit,
      include: {
        steps: {
          select: {
            status: true,
            artifacts: { where: { artifactKey: 'report-id' }, select: { data: true } }
          }
        }
      }
    })

    // 计算每个轮次的进度
    return runs.map((run) => {
      const total = run.steps.length
      const completed = run.steps.filter((s) => ['COMPLETED','SKIPPED'].includes(s.status)).length
      const failed = run.steps.filter((s) => s.status === 'FAILED').length

      return {
        ...run,
        metadata: run.metadata ? JSON.parse(run.metadata) : {},
        reportId: (() => { const value = run.steps.flatMap(step => step.artifacts)[0]?.data; if (!value) return null; try { return JSON.parse(value) } catch { return value } })(),
        progress: {
          total,
          completed,
          failed,
          percentage: Math.round((completed / total) * 100)
        }
      }
    })
  }
}
