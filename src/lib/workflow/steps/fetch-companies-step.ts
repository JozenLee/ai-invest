import { prisma } from '@/lib/db'
import type { StepDefinition } from '../types'
export const fetchCompaniesStep: StepDefinition = {
  name: 'fetch-companies', description: '读取订阅持仓企业', dependencies: ['fetch-etf-holdings'], estimatedDuration: 1000,
  async execute(context) {
    const holdings = (context.artifacts.get('etf-holdings') || []) as any[]
    const codes = [...new Set(holdings.map((row) => String(row.stock_code || row.stockCode || '')).filter(Boolean))]
    const snapshot = context.input.companySource === 'graph' ? await prisma.rawPayload.findFirst({ where: { datasetKey: 'industry_graph' }, orderBy: { fetchedAt: 'desc' } }) : null
    const group = snapshot ? JSON.parse(snapshot.payload).find((item: any) => item.id === context.input.industryId) : null
    const stocks = (group?.companies || []) as any[]
    const companies = codes.filter((code) => context.input.companySource !== 'graph' || stocks.some((stock) => (stock.stockCode || stock.stock_code || stock.ticker || stock.code) === code)).map((stockCode) => ({
      stockCode, stockName: holdings.find((row) => (row.stock_code || row.stockCode) === stockCode)?.stock_name || stockCode, source: 'subscription-holdings',
    }))
    await context.saveArtifact('companies', companies, 'DATA')
    await context.saveArtifact('company-codes', companies.map((row) => row.stockCode).join(','), 'DATA')
    await context.updateProgress(1, 1, '已读取 ' + companies.length + ' 家订阅持仓企业')
  },
}
