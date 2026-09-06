import { readStoredOverview, readStoredCapitalFlow, readMarketDataset } from '@/lib/stored-market-data'
import type { StepDefinition } from '../types'
import { summarizeMarketReference } from '@/lib/analysis/evidence'
export const fetchMarketSnapshotStep: StepDefinition = {
  name: 'fetch-market-snapshot', description: '读取订阅市场快照与来源', dependencies: [], estimatedDuration: 1000,
  async execute(context) {
    const [overview, capitalFlow] = await Promise.all([readStoredOverview(), readStoredCapitalFlow()])
    const reference = { mainFlow: await readMarketDataset('market_main_flow'), margin: await readMarketDataset('margin_balance') }
    await context.saveArtifact('market-reference-data', reference, 'DATA')
    await context.saveArtifact('market-reference-indicators', { mainFlow: summarizeMarketReference(reference.mainFlow), margin: summarizeMarketReference(reference.margin) }, 'DATA')
    await context.saveArtifact('market-snapshot', { overview: overview.data, capitalFlow: capitalFlow.data, sectors: [...(capitalFlow.data?.topInflowSectors || []), ...(capitalFlow.data?.topOutflowSectors || [])], readAt: new Date().toISOString(), source: 'subscription-database' }, 'DATA')
    await context.updateProgress(1, 1, '订阅快照读取完成；缺失数据未触发采集')
  }
}
