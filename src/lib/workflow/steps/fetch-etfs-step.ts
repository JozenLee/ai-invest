import { prisma } from '@/lib/db'
import type { StepDefinition } from '../types'
export const fetchETFsStep: StepDefinition = {
  name: 'fetch-etfs', description: '读取已订阅ETF与产业映射', dependencies: [], estimatedDuration: 1000,
  async execute(context) {
    const industryId = context.input.industryId
    const subscriptions = await prisma.dataSubscription.findMany({ where: { enabled: true, instrument: { type: 'ETF' } }, include: { instrument: true } })
    const snapshot = await prisma.rawPayload.findFirst({ where: { datasetKey: 'industry_graph' }, orderBy: { fetchedAt: 'desc' } })
    const groups = snapshot ? JSON.parse(snapshot.payload) : []
    const group = groups.find((item: any) => item.id === industryId)
    const subscribed = new Set(subscriptions.map((item) => item.instrument.code))
    const matched = group?.etfs?.filter((item: any) => subscribed.has(item.code)) || []
    const fallback = subscriptions.filter((item) => { try { return JSON.parse(item.profile || '{}').industryId === industryId } catch { return false } })
    const bindings = matched.length ? matched.map((item: any) => ({ etf_code: item.code, etf_name: item.name })) : fallback.map((item) => ({ etf_code: item.instrument.code, etf_name: item.instrument.name }))
    const industryName = group?.name || (fallback[0] ? JSON.parse(fallback[0].profile!).industryName : null)
    if (!industryName) throw new Error('数据订阅中没有该产业映射，请先同步订阅')
    await context.saveArtifact('industry-info', { id: industryId, name: industryName, code: group?.code, source: 'subscription-database' }, 'DATA')
    await context.saveArtifact('etf-bindings', bindings, 'DATA')
    await context.saveArtifact('etf-codes', bindings.map((item: any) => item.etf_code).join(','), 'DATA')
    await context.updateProgress(1, 1, '已读取 ' + bindings.length + ' 个已订阅ETF')
  },
}
