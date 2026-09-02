import { marketDataProvider } from '@/lib/providers'
import { getMarketOverview } from '@/lib/services/market-data.service'
import type { StepDefinition } from '../types'

export const fetchMarketSnapshotStep: StepDefinition = {
  name: 'fetch-market-snapshot',
  description: '获取市场指数与板块资金流向',
  dependencies: [],
  estimatedDuration: 15000,
  async execute(context) {
    await context.updateProgress(0, 3, '正在获取市场指数与板块资金流向...')
    const [overview, capitalFlow] = await Promise.allSettled([
      getMarketOverview(),
      marketDataProvider.fetch('/api/capital-flow/advanced/enhanced', undefined, 'market-capital-flow:latest', 60000)
    ])
    await context.updateProgress(1, 3, '市场指数已获取')
    await context.updateProgress(2, 3, '板块资金流向已获取')
    const capitalFlowPayload = capitalFlow.status === 'fulfilled' ? capitalFlow.value as any : null
    const capitalFlowData = capitalFlowPayload?.data ?? capitalFlowPayload
    const sectorRows = [
      ...(Array.isArray(capitalFlowData?.topInflowSectors) ? capitalFlowData.topInflowSectors : []),
      ...(Array.isArray(capitalFlowData?.topOutflowSectors) ? capitalFlowData.topOutflowSectors : []),
    ]
    await context.saveArtifact('market-snapshot', {
      overview: overview.status === 'fulfilled' ? overview.value : null,
      capitalFlow: capitalFlow.status === 'fulfilled' ? capitalFlow.value : null,
      sectors: sectorRows,
      fetchedAt: new Date().toISOString()
    }, 'DATA')
    await context.updateProgress(3, 3, '市场数据分析输入准备完成')
  }
}
