import { industryProvider } from '@/lib/providers'
import type { StepDefinition } from '../types'

/**
 * 步骤3: 获取产业链企业数据
 */
export const fetchCompaniesStep: StepDefinition = {
  name: 'fetch-companies',
  description: '获取产业链企业',
  dependencies: ['fetch-etfs'],
  estimatedDuration: 15000,

  async execute(context) {
    const industryInfo = context.artifacts.get('industry-info') as any

    if (!industryInfo) {
      throw new Error('Missing industry info from previous step')
    }

    await context.updateProgress(0, 1, '正在查询产业链节点...')

    // 从FastAPI获取产业图谱结构（包含企业映射）
    const graphData = await industryProvider.fetch<any>(
      `/api/v1/industries/${industryInfo.id}/graph`,
      undefined,
      `industry-graph:${industryInfo.id}`
    )

    // 提取所有企业节点
    const allCompanies: any[] = []

    const graphNodes = Array.isArray(graphData?.nodes)
      ? graphData.nodes
      : (graphData?.stages || []).flatMap((stage: any) =>
          (stage.segments || []).map((segment: any) => ({
            ...segment,
            nodeId: segment.id,
            nodeName: segment.name,
            nodeType: segment.type || 'segment',
          })))

    if (graphNodes.length > 0) {
      for (const node of graphNodes) {
        // 提取节点中的企业信息
        if (node.companies && Array.isArray(node.companies)) {
          for (const company of node.companies) {
            allCompanies.push({
              stockCode: company.stock_code || company.stockCode || company.ticker || company.code,
              stockName: company.stock_name || company.name,
              nodeId: node.id,
              nodeName: node.name,
              nodeType: node.type,
              relevance: company.relevance || 1.0,
              category: company.category,
              description: company.description
            })
          }
        }
      }
    }

    await context.updateProgress(1, 1, `找到 ${allCompanies.length} 家相关企业`)

    if (allCompanies.length === 0) {
      console.warn(`No companies found for industry: ${industryInfo.name}`)
      await context.saveArtifact('companies', [], 'DATA')
      return
    }

    // 保存企业列表
    await context.saveArtifact('companies', allCompanies, 'DATA')

    // 保存企业代码列表（用于后续查询）
    const companyCodes = allCompanies.map((c) => c.stockCode).join(',')
    await context.saveArtifact('company-codes', companyCodes, 'DATA')
  }
}
