/* eslint-disable @typescript-eslint/no-explicit-any -- Provider snapshots are normalized after selection. */
import { prisma } from '@/lib/db'
import type { StepDefinition } from '../types'
import { workflowInput, workflowNodeConfig } from '../method-config'
import { selectResearchCompanies } from '../company-selection'
export const fetchCompaniesStep: StepDefinition = {
  name: 'fetch-companies', description: '读取订阅持仓企业', dependencies: ['fetch-etf-holdings', 'freeze-research'], estimatedDuration: 1000,
  async execute(context) {
    const holdings = workflowInput<any[]>(context,'holdings','etf-holdings') || []
    const config=workflowNodeConfig(context,'fetch-companies')
    const maxCompanies=Number(config?.parameters.maxCompanies??30)
    const codes = [...new Set(holdings.map((row) => String(row.stock_code || row.stockCode || '')).filter(Boolean))]
    const snapshot = context.input.companySource === 'graph' ? await prisma.rawPayload.findFirst({ where: { datasetKey: 'industry_graph' }, orderBy: { fetchedAt: 'desc' } }) : null
    const group = snapshot ? JSON.parse(snapshot.payload).find((item: any) => item.id === context.input.industryId) : null
    const stocks = (group?.companies || []) as any[]
    const candidates = codes.filter((code) => context.input.companySource !== 'graph' || stocks.some((stock) => (stock.stockCode || stock.stock_code || stock.ticker || stock.code) === code)).map((stockCode) => ({
      stockCode, stockName: holdings.find((row) => (row.stock_code || row.stockCode) === stockCode)?.stock_name || stockCode, source: 'subscription-holdings',
    }))
    const {selected:companies,candidateCount,methodId}=selectResearchCompanies(candidates,{methodId:config?.methodId,maxCompanies})
    await context.saveArtifact('companies', companies, 'DATA')
    await context.saveArtifact('company-codes', companies.map((row) => row.stockCode).join(','), 'DATA')
    await context.saveArtifact('company-selection-summary',{methodId,maxCompanies,candidateCount,selectedCount:companies.length,status:companies.length<=maxCompanies?'passed':'blocked'},'DATA')
    await context.updateProgress(1, 1, '已读取 ' + companies.length + ' 家订阅持仓企业')
  },
}
