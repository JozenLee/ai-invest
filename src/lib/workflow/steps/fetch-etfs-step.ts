import { industryProvider, marketDataProvider } from '@/lib/providers'
import { prisma } from '@/lib/db'
import type { StepDefinition } from '../types'

/**
 * 步骤1: 获取产业相关的ETF列表
 */
export const fetchETFsStep: StepDefinition = {
  name: 'fetch-etfs',
  description: '获取相关ETF列表',
  dependencies: [],
  estimatedDuration: 5000,

  async execute(context) {
    const { industryId } = context.input

    if (!industryId) {
      throw new Error('Missing required parameter: industryId')
    }

    await context.updateProgress(0, 2, '正在查询产业图谱...')

    // 方法1: 从产业详情获取ETF绑定
    let industryData: any
    try {
      industryData = await industryProvider.fetch<any>(
        `/api/v1/industries/${industryId}`,
        undefined,
        `industry:${industryId}`
      )
    } catch (error) {
      const status = typeof error === 'object' && error !== null && 'status' in error
        ? Number((error as { status?: unknown }).status)
        : undefined
      if (status !== 404) throw error

      // The data service may not expose the legacy industry endpoint while
      // the same graph data is already available in the local database.
      const localIndustry = await prisma.graphNode.findUnique({
        where: { id: industryId },
        include: { etfBindings: true }
      })
      if (localIndustry) {
        industryData = {
          id: localIndustry.id,
          name: localIndustry.name,
          code: (localIndustry as any).code,
          description: localIndustry.description,
          etf_bindings: localIndustry.etfBindings.map(binding => ({
            etf_code: binding.etfCode,
            etf_name: binding.etfName,
            weight: binding.weight,
            bind_type: binding.bindType,
            description: binding.description
          }))
        }
      } else {
        throw error
      }
    }

    if (!industryData) {
      throw new Error(`Industry not found: ${industryId}`)
    }

    let etfBindings = industryData.etf_bindings || industryData.etfBindings || []

    await context.updateProgress(1, 2, '正在查询知识图谱ETF数据...')

    // 方法2: 从知识图谱获取节点级 ETF，并与产业详情中的绑定合并。
    // 产业详情可能只包含少量主题 ETF，完整列表在 stages[].segments[].matchedEtfs 中。
    try {
        const graphData = await industryProvider.fetch<any>(
          `/api/v1/industries/${industryId}/graph`,
          undefined,
          `industry-graph:${industryId}`
        )

        // 图谱页面使用 stages[].segments[].matchedEtfs 作为节点 ETF 数据源。
        // 旧实现只读取顶层 graphData.etfs，而 Neo4j 图谱通常不会返回该字段。
        const graphPayload = graphData?.data || graphData
        const graphEtfs = [
          ...(Array.isArray(graphPayload?.etfs) ? graphPayload.etfs : []),
          ...(Array.isArray(graphPayload?.nodes)
            ? graphPayload.nodes.flatMap((node: any) => node.matchedEtfs || node.matched_etfs || node.etfBindings || node.etf_bindings || [])
            : []),
          ...(Array.isArray(graphPayload?.stages)
            ? graphPayload.stages.flatMap((stage: any) =>
                (stage.segments || stage.links || []).flatMap((segment: any) =>
                  segment.matchedEtfs || segment.matched_etfs || segment.etfBindings || segment.etf_bindings || []
                )
              )
            : []),
          ...(graphPayload?.lanes && typeof graphPayload.lanes === 'object'
            ? Object.values(graphPayload.lanes).flatMap((lane: any) =>
                (lane?.segments || []).flatMap((segment: any) =>
                  segment.matchedEtfs || segment.matched_etfs || segment.etfBindings || segment.etf_bindings || []
                )
              )
            : [])
        ]

        // 完整图谱接口只返回企业结构；匹配 ETF 保存在泳道接口的节点字段中。
        if (graphEtfs.length === 0) {
          const swimlaneData = await industryProvider.fetch<any>(
            `/api/v1/industries/${industryId}/swimlane`,
            undefined,
            `industry-swimlane:${industryId}`
          )
          const lanes = swimlaneData?.data?.lanes || swimlaneData?.lanes || {}
          graphEtfs.push(...Object.values(lanes).flatMap((lane: any) =>
            (lane?.segments || []).flatMap((segment: any) =>
              segment.matchedEtfs || segment.matched_etfs || segment.etfBindings || segment.etf_bindings || []
            )
          ))
        }

        const etfMap = new Map<string, any>()
        graphEtfs.forEach((etf: any) => {
          const code = String(etf?.code || etf?.ticker || etf?.etf_code || etf?.etfCode || '').trim()
          if (code && !etfMap.has(code)) {
            etfMap.set(code, {
              etf_code: code,
              etf_name: etf.name || etf.etf_name || etf.etfName,
              weight: etf.weight ?? etf.relevance ?? 1.0,
              bind_type: etf.type || etf.bind_type || etf.bindType || 'related',
              description: etf.description || etf.reasoning
            })
          }
        })
        const mergedEtfMap = new Map<string, any>()
        ;(Array.isArray(etfBindings) ? etfBindings : []).forEach((etf: any) => {
          const code = String(etf?.etf_code || etf?.etfCode || etf?.code || etf?.ticker || '').trim()
          if (code) mergedEtfMap.set(code, { ...etf, etf_code: code })
        })
        etfMap.forEach((etf, code) => {
          mergedEtfMap.set(code, { ...mergedEtfMap.get(code), ...etf })
        })
        etfBindings = Array.from(mergedEtfMap.values())
      } catch (error) {
        console.warn('Failed to fetch ETF from graph:', error)
      }

      // Neo4j 图谱接口只返回产业链节点时，按产业代码补充 ETF 候选。
      if (etfBindings.length === 0 && industryData.code) {
        try {
          const domainKey = industryData.code === 'ai_hardware' ? 'ai_computing' : industryData.code
          const domainData = await marketDataProvider.fetch<any>(
            `/api/etf/list/by-domain/${domainKey}?limit=20`,
            undefined,
            `etf-domain:${domainKey}`
          )
          const domainEtfs = Array.isArray(domainData?.data)
            ? domainData.data
            : domainData?.data?.etfs || domainData?.etfs || []
          etfBindings = domainEtfs.map((etf: any) => ({
            etf_code: etf.ticker || etf.code || etf.etf_code,
            etf_name: etf.name || etf.etf_name,
            bind_type: 'domain'
          })).filter((etf: any) => etf.etf_code)
        } catch (error) {
          console.warn('Failed to fetch ETF by industry domain:', error)
        }

        if (etfBindings.length === 0 && industryData.code === 'ai_hardware') {
          etfBindings = [
            { etf_code: '159819', etf_name: '人工智能 ETF', bind_type: 'domain-fallback' },
            { etf_code: '515070', etf_name: '人工智能 ETF（华夏）', bind_type: 'domain-fallback' },
            { etf_code: '512480', etf_name: '半导体 ETF', bind_type: 'domain-fallback' },
            { etf_code: '159995', etf_name: '芯片 ETF', bind_type: 'domain-fallback' }
          ]
          await context.updateProgress(2, 2, `领域接口暂不可用，已启用 ${etfBindings.length} 个 AI 算力 ETF 兜底候选`)
        }
    }

    const etfCodes = etfBindings.map((b: any) => b.etf_code).filter(Boolean)

    if (etfCodes.length > 0) {
      await context.updateProgress(2, 2, `找到 ${etfCodes.length} 个相关ETF（已去重）`)

      // 保存代码列表为数据产物。代码是工作流内部输入，不是数据库引用。
      await context.saveArtifact('etf-codes', etfCodes.join(','), 'DATA')

      // 保存ETF详情
      await context.saveArtifact('etf-bindings', etfBindings, 'DATA')
    } else {
      await context.updateProgress(2, 2, '该产业暂无绑定的ETF')

      // 保存空数据，供后续步骤判断
      await context.saveArtifact('etf-codes', '', 'DATA')
      await context.saveArtifact('etf-bindings', [], 'DATA')
    }

    // 保存产业信息
    await context.saveArtifact(
      'industry-info',
      {
        id: industryData.id,
        name: industryData.name,
        code: industryData.code,
        description: industryData.description
      },
      'DATA'
    )
  }
}
