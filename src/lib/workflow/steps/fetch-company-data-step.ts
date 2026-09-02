import { marketDataProvider } from '@/lib/providers'
import { prisma } from '@/lib/db'
import type { StepDefinition } from '../types'

/**
 * 步骤4: 获取企业市场数据
 */
export const fetchCompanyDataStep: StepDefinition = {
  name: 'fetch-company-data',
  description: '获取企业市场数据',
  dependencies: ['fetch-companies'],
  estimatedDuration: 20000,

  async execute(context) {
    const companies = (context.artifacts.get('companies') as any[]) || []

    if (!companies || companies.length === 0) {
      console.warn('No companies to fetch data for')
      await context.saveArtifact('company-market-data', [], 'DATA')
      return
    }

    await context.updateProgress(0, companies.length, '开始获取企业市场数据...')

    const codes = companies.map((company) => String(company.stockCode || '')).filter(Boolean)
    const localRows = await prisma.stockDaily.findMany({ where: { ticker: { in: codes } }, orderBy: { date: 'desc' } })
    const localByCode = new Map<string, (typeof localRows)[number]>()
    for (const row of localRows) if (!localByCode.has(row.ticker)) localByCode.set(row.ticker, row)

    // 批量获取企业市场数据
    let completed = 0
    const companyDataList = await Promise.all(companies.map(async (company) => {
      const local = localByCode.get(String(company.stockCode || ''))
      if (local) return { success: true, data: { ticker: local.ticker, date: local.date.toISOString().slice(0, 10), open: local.open, high: local.high, low: local.low, close: local.close, volume: Number(local.volume), amount: local.amount || 0, changePct: 0, source: 'local-database' } }
      try {
        return await marketDataProvider.fetch<any>(
          `/api/market/stock/${company.stockCode}`,
          undefined,
          `stock:${company.stockCode}:latest`
        )
      } catch (error) {
        console.warn(`Failed to fetch company data for ${company.stockCode}:`, error)
        return null
      } finally {
        completed += 1
        await context.updateProgress(
          completed,
          companies.length,
          `已处理 ${completed}/${companies.length} 家企业行情（${companies.length - completed} 家待处理）`
        )
      }
    }))

    // 合并企业信息和市场数据
    const enrichedData = companies.map((company, index) => ({
      ...company,
      marketData: companyDataList[index]?.data || companyDataList[index] || null
    }))

    await context.saveArtifact('company-market-data', enrichedData, 'DATA')
  }
}
