/* eslint-disable @typescript-eslint/no-explicit-any -- Persisted workflow artifacts and legacy run metadata are runtime-validated heterogeneous JSON. */
import { prisma } from '@/lib/db'
import { createHash } from 'node:crypto'
import type { StepDefinition, StepContext, WorkflowDefinition, WorkflowNodeConfig } from './types'
import {executionWaves} from './execution-waves'
import { validateArtifactValue } from './artifact-contracts'

type InputRevision = { portId:string; artifactKey:string; revisionId:string; contentHash:string; value:unknown }

export class ExecutionOrchestrator {
  constructor(
    private workflowId: string,
    private steps: StepDefinition[],
    private definition?: WorkflowDefinition,
  ) {
    if(definition){
      const names=new Set(steps.map(step=>step.name))
      const missing=definition.nodes.filter(node=>!names.has(node.id)).map(node=>node.id)
      if(missing.length)throw new Error(`工作流定义包含未实现节点：${missing.join(', ')}`)
      this.steps=steps.map(step=>({
        ...step,
        dependencies:[...new Set([...step.dependencies,...definition.edges.filter(edge=>edge.targetNodeId===step.name&&edge.required).map(edge=>edge.sourceNodeId),...(definition.nodes.find(node=>node.id===step.name)?.executionPolicy?.after||[])])],
      }))
      executionWaves(this.steps)
    }
  }

  /**
   * 创建新的执行轮次
   */
  async createRun(metadata?: any): Promise<string> {
    // 清理旧轮次
    await this.cleanupOldRuns()

    const nodeConfigs=this.normalizedNodeConfigs(metadata?.nodeConfigs)
    const definitionHash=this.definition?createHash('sha256').update(JSON.stringify(this.definition)).digest('hex'):null
    const run = await prisma.executionRun.create({
      data: {
        workflowId: this.workflowId,
        status: 'PENDING',
        metadata: metadata ? JSON.stringify({...metadata,nodeConfigs,workflowVersion:this.definition?.version||'legacy',definitionHash}) : null,
        workflowVersion:this.definition?.version||'legacy',
        definitionHash,
        definitionSnapshot:this.definition?JSON.stringify(this.definition):null,
        configSnapshot:JSON.stringify(nodeConfigs),
        steps: {
          create: this.steps.map((step, index) => {
            const node=this.definition?.nodes.find(candidate=>candidate.id===step.name)
            const config=nodeConfigs[step.name]
            const method=node?.methods.find(candidate=>candidate.id===config?.methodId)
            return {stepName: step.name,stepIndex: index,status: 'PENDING',methodId:method?.id||null,methodVersion:method?.version||null,configSnapshot:config?JSON.stringify(config):null}
          })
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
      for(const wave of executionWaves(this.steps))await Promise.all(wave.map(step=>this.executeStep(runId,step.name)))

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

    const inputRevisions=await this.loadInputRevisions(runId,stepName)
    const attemptNumber=await prisma.executionAttempt.count({where:{stepId:stepRecord.id}})+1
    const inputHash=createHash('sha256').update(inputRevisions.map(item=>`${item.portId}:${item.contentHash}`).sort().join('|')).digest('hex')
    const attempt=await prisma.executionAttempt.create({data:{stepId:stepRecord.id,attemptNumber,status:'RUNNING',methodId:stepRecord.methodId,methodVersion:stepRecord.methodVersion,configSnapshot:stepRecord.configSnapshot,inputHash}})

    // 更新状态为运行中
    await prisma.executionStep.update({
      where: { id: stepRecord.id },
      data: { status: 'RUNNING', startedAt: new Date(), completedAt: null, error: null }
    })

    const startTime = Date.now()

    try {
      // 加载依赖步骤的产物
      const artifacts = await this.loadArtifacts(runId)

      // 构建执行上下文
      const context: StepContext = {
        runId,
        stepId: stepRecord.id,
        input: await this.loadInput(runId),
        inputs:new Map(inputRevisions.flatMap(item=>[[item.portId,item.value],[item.artifactKey,item.value]])),
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
          await this.saveArtifact(stepRecord.id, key, data, type,attempt.id,stepName,inputRevisions)
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
      const outputRevisions=await prisma.artifactRevision.findMany({where:{attemptId:attempt.id},select:{contentHash:true}})
      await prisma.executionAttempt.update({where:{id:attempt.id},data:{status:'COMPLETED',completedAt:new Date(),duration,outputHash:createHash('sha256').update(outputRevisions.map(item=>item.contentHash).sort().join('|')).digest('hex')}})
    } catch (error) {
      await prisma.executionStep.update({
        where: { id: stepRecord.id },
        data: {
          status: 'FAILED',
          error: String(error),
          completedAt: new Date()
        }
      })
      await prisma.executionAttempt.update({where:{id:attempt.id},data:{status:'FAILED',error:String(error),completedAt:new Date(),duration:Date.now()-startTime}})
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

    await this.executeAll(runId)
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

    const complete=new Set(refreshedRun.steps.filter(step=>['COMPLETED','SKIPPED'].includes(step.status)).map(step=>step.stepName))
    const nextStep = refreshedRun.steps.find(record => {
      if(!['PENDING','FAILED'].includes(record.status))return false
      const definition=this.steps.find(step=>step.name===record.stepName)
      return definition?.dependencies.every(name=>complete.has(name))
    })

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
          const attemptNumber=await prisma.executionAttempt.count({where:{stepId:step.id}})+1
          const attempt=await prisma.executionAttempt.create({data:{stepId:step.id,attemptNumber,status:'SKIPPED',startedAt:new Date(),completedAt:new Date(),methodId:step.methodId,methodVersion:step.methodVersion,configSnapshot:step.configSnapshot,error:'本轮为本地规则复核，按条件跳过智能模块'}})
          await this.saveArtifact(step.id,step.stepName,step.stepName==='social-report'||step.stepName==='portfolio-analysis'?null:{analysis:'本轮为本地规则复核，未调用AI；请查看规则条件与证据变化。'},'DATA',attempt.id,step.stepName,[])
          if(step.stepName==='social-report')await this.saveArtifact(step.id,'social-report-status',{status:'not-requested',message:'本地规则复核，不生成AI一页版'},'DATA',attempt.id,step.stepName,[])
          await prisma.executionStep.update({where:{id:step.id},data:{status:'SKIPPED',completedAt:new Date()}})
        }
      }
      return
    }
  }

  private async loadArtifacts(runId: string): Promise<Map<string, any>> {
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

  private async loadInputRevisions(runId:string,stepName:string):Promise<InputRevision[]> {
    if(!this.definition)return []
    const ports=this.definition.nodes.find(node=>node.id===stepName)?.inputs||[]
    const bindings:InputRevision[]=[]
    for(const port of ports){
      const sourceStep=await prisma.executionStep.findUnique({where:{runId_stepName:{runId,stepName:port.sourceNodeId!}},select:{id:true}})
      if(!sourceStep){if(port.required)throw new Error(`输入来源不存在：${port.sourceNodeId}`);continue}
      const revision=await prisma.artifactRevision.findFirst({where:{stepId:sourceStep.id,artifactKey:port.artifactKey},orderBy:{createdAt:'desc'}})
      let value:unknown
      if(revision){try{value=JSON.parse(revision.data||'null')}catch{value=revision.data}}
      else {
        const current=await prisma.stepArtifact.findUnique({where:{stepId_artifactKey:{stepId:sourceStep.id,artifactKey:port.artifactKey}}})
        if(current){try{value=JSON.parse(current.data||'null')}catch{value=current.data}}
        if(current&&!revision){
          const serialized=current.data||'null'
          const imported=await prisma.artifactRevision.create({data:{stepId:sourceStep.id,artifactKey:current.artifactKey,artifactType:current.artifactType,dataType:current.dataType,data:current.data,fileUrl:current.fileUrl,size:current.size,schemaId:port.schemaId,schemaVersion:port.schemaVersion,contentHash:createHash('sha256').update(serialized).digest('hex'),confidentiality:port.confidentiality||'public'}})
          bindings.push({portId:port.id,artifactKey:port.artifactKey,revisionId:imported.id,contentHash:imported.contentHash,value});continue
        }
      }
      if(!revision){if(port.required)throw new Error(`必需输入未生成：${stepName}.${port.id} <- ${port.sourceNodeId}.${port.artifactKey}`);continue}
      const validation=validateArtifactValue(port.schemaId,value,{nullable:!port.required})
      if(!validation.valid)throw new Error(`输入契约校验失败：${stepName}.${port.id}：${validation.error}`)
      bindings.push({portId:port.id,artifactKey:port.artifactKey,revisionId:revision.id,contentHash:revision.contentHash,value})
    }
    return bindings
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
    type: string,
    attemptId:string|null,
    stepName:string,
    inputRevisions:InputRevision[],
  ): Promise<void> {
    const serialized = JSON.stringify(data)
    const size = Buffer.byteLength(serialized, 'utf8')
    const outputPort=this.definition?.nodes.find(node=>node.id===stepName)?.outputs.find(port=>port.artifactKey===key)
    if(outputPort){const validation=validateArtifactValue(outputPort.schemaId,data,{nullable:data==null});if(!validation.valid)throw new Error(`输出契约校验失败：${stepName}.${outputPort.id}：${validation.error}`)}

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
    const revision=await prisma.artifactRevision.create({data:{stepId,attemptId,artifactKey:key,artifactType:type,dataType:'JSON',data:serialized,size,schemaId:outputPort?.schemaId||key,schemaVersion:outputPort?.schemaVersion||1,contentHash:createHash('sha256').update(serialized).digest('hex'),sourceAsOf:this.sourceAsOf(data),confidentiality:outputPort?.confidentiality||'public',qualityStatus:this.qualityStatus(data)}})
    for(const source of inputRevisions){
      const data={sourceRevisionId:source.revisionId,targetRevisionId:revision.id,sourcePort:source.portId,targetPort:outputPort?.id||key}
      await prisma.artifactLineage.upsert({where:{sourceRevisionId_targetRevisionId_sourcePort_targetPort:data},create:data,update:{}})
    }
  }

  private qualityStatus(data:any){
    if(data&&typeof data==='object'&&typeof data.status==='string')return data.status
    if(data&&typeof data==='object'&&typeof data.quality==='string')return data.quality
    return null
  }

  private sourceAsOf(data:any):Date|null{
    const candidates:Array<unknown>=[]
    const collect=(value:any)=>{if(!value||typeof value!=='object')return;for(const key of ['asOf','dataDate','fetchedAt','readAt','publishedAt','date'])if(value[key])candidates.push(value[key])}
    collect(data);if(Array.isArray(data))data.slice(0,500).forEach(collect)
    const timestamps=candidates.map(value=>new Date(String(value))).filter(value=>!Number.isNaN(value.getTime())).map(value=>value.getTime())
    return timestamps.length?new Date(Math.max(...timestamps)):null
  }

  private normalizedNodeConfigs(raw:unknown):Record<string,WorkflowNodeConfig>{
    if(!this.definition)return {}
    const configs=raw&&typeof raw==='object'?raw as Record<string,any>:{}
    return Object.fromEntries(this.definition.nodes.map(node=>{
      const candidate=configs[node.id]&&typeof configs[node.id]==='object'?configs[node.id]:{}
      const method=node.methods.find(item=>item.id===candidate.methodId)||node.methods.find(item=>item.id===node.defaultMethodId)!
      const supplied=candidate.parameters&&typeof candidate.parameters==='object'?candidate.parameters:{}
      const parameters=Object.fromEntries(method.fields.map(field=>{
        const value=supplied[field.id]??field.defaultValue
        if(field.type==='number')return [field.id,Math.min(field.max??Infinity,Math.max(field.min??-Infinity,Number(value)||Number(field.defaultValue)))]
        if(field.type==='boolean')return [field.id,value===true]
        const values=field.options?.map(option=>option.value)||[]
        return [field.id,values.includes(String(value))?String(value):field.defaultValue]
      }))
      return [node.id,{methodId:method.id,parameters}]
    }))
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
  async getRunDetails(runId: string, compact = false, stepName?:string) {
    return prisma.executionRun.findUnique({
      where: { id: runId },
      include: {
        steps: {
          ...(stepName?{where:{stepName}}:{}),
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

  getDefinition(){return this.definition}

  async getRunGraph(runId:string){
    if(!this.definition)throw new Error('该工作流没有拓扑定义')
    const run=await prisma.executionRun.findUnique({where:{id:runId},include:{steps:{orderBy:{stepIndex:'asc'},include:{artifacts:{select:{artifactKey:true,artifactType:true,size:true,createdAt:true}},attempts:{orderBy:{attemptNumber:'desc'},take:1},revisions:{orderBy:{createdAt:'desc'},select:{id:true,artifactKey:true,contentHash:true,schemaId:true,schemaVersion:true,sourceAsOf:true,confidentiality:true,qualityStatus:true,createdAt:true}}}}}})
    if(!run)return null
    const definition=run.definitionSnapshot?JSON.parse(run.definitionSnapshot) as WorkflowDefinition:this.definition
    return {
      id:run.id,status:run.status,startedAt:run.startedAt,completedAt:run.completedAt,error:run.error,
      workflowVersion:run.workflowVersion,definitionHash:run.definitionHash,
      configSnapshot:run.configSnapshot?JSON.parse(run.configSnapshot):{},
      phases:definition.phases,
      nodes:definition.nodes.map(node=>{
        const step=run.steps.find(candidate=>candidate.stepName===node.id)
        const revisions=new Map<string, any>()
        for(const revision of step?.revisions||[])if(!revisions.has(revision.artifactKey))revisions.set(revision.artifactKey,revision)
        return {...node,execution:step?{stepId:step.id,status:step.status,startedAt:step.startedAt,completedAt:step.completedAt,duration:step.duration,error:step.error,progress:step.progress?JSON.parse(step.progress):null,methodId:step.methodId,methodVersion:step.methodVersion,config:step.configSnapshot?JSON.parse(step.configSnapshot):null,attempt:step.attempts[0]||null,artifacts:step.artifacts.map(artifact=>({...artifact,revision:revisions.get(artifact.artifactKey)||null}))}:null}
      }),
      edges:definition.edges.map(edge=>{
        const source=run.steps.find(step=>step.stepName===edge.sourceNodeId)
        const artifact=source?.artifacts.find(item=>item.artifactKey===edge.artifactKey)
        return {...edge,state:source?.status==='FAILED'?'blocked':artifact&&['COMPLETED','SKIPPED'].includes(source?.status||'')?'ready':'waiting',size:artifact?.size||null,createdAt:artifact?.createdAt||null}
      }),
    }
  }

  async prepareRerun(runId:string,stepName:string,strategy:'node'|'downstream',rawConfig?:unknown){
    if(!this.definition)throw new Error('该工作流没有拓扑定义')
    const node=this.definition.nodes.find(candidate=>candidate.id===stepName)
    if(!node)throw new Error('分析模块不存在')
    const run=await prisma.executionRun.findUnique({where:{id:runId},include:{steps:true}})
    if(!run)throw new Error('分析轮次不存在')
    if(run.steps.some(step=>step.status==='RUNNING'))throw new Error('当前轮次仍在执行，不能重跑模块')
    const currentHash=createHash('sha256').update(JSON.stringify(this.definition)).digest('hex')
    if(run.definitionHash&&run.definitionHash!==currentHash)throw new Error('该轮次使用旧版工作流定义，请新建分析以避免混用不同拓扑')
    const affected=new Set([stepName])
    let changed=true
    while(changed){changed=false;for(const edge of this.definition.edges)if(affected.has(edge.sourceNodeId)&&!affected.has(edge.targetNodeId)){affected.add(edge.targetNodeId);changed=true}}
    await prisma.executionStep.updateMany({where:{runId,stepName:{in:[...affected]}},data:{status:'PENDING',startedAt:null,completedAt:null,duration:null,error:null,progress:null}})
    if(rawConfig&&node.configurable){
      const normalized=this.normalizedNodeConfigs({[stepName]:rawConfig})[stepName]
      const method=node.methods.find(candidate=>candidate.id===normalized.methodId)!
      await prisma.executionStep.update({where:{runId_stepName:{runId,stepName}},data:{methodId:method.id,methodVersion:method.version,configSnapshot:JSON.stringify(normalized)}})
      const metadata=run.metadata?JSON.parse(run.metadata):{}
      const configSnapshot=run.configSnapshot?JSON.parse(run.configSnapshot):{}
      const nodeConfigs={...(metadata.nodeConfigs||{}),[stepName]:normalized}
      if(stepName==='fetch-companies')metadata.companySource=normalized.methodId==='graph-intersection-selection'?'graph':'etf'
      await prisma.executionRun.update({where:{id:runId},data:{metadata:JSON.stringify({...metadata,nodeConfigs}),configSnapshot:JSON.stringify({...configSnapshot,[stepName]:normalized})}})
    }
    await prisma.executionRun.update({where:{id:runId},data:{status:'PENDING',completedAt:null,error:null}})
    return {target:stepName,strategy,invalidated:[...affected],executeMode:strategy==='downstream'?'resume':'step'} as const
  }

  async getArtifactLineage(revisionId:string){
    return prisma.artifactRevision.findUnique({where:{id:revisionId},include:{step:{select:{runId:true,stepName:true}},attempt:true,sources:{include:{source:{include:{step:{select:{stepName:true}}}}}},targets:{include:{target:{include:{step:{select:{stepName:true}}}}}}}})
  }
}
