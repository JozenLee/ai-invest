/* eslint-disable @typescript-eslint/no-explicit-any -- Stored taxonomy payloads retain legacy JSON shapes. */
import { prisma } from '@/lib/db'
import { getNewsTaxonomy, matchesNewsIndustry } from '@/lib/news-taxonomy'
import type { StepDefinition } from '../types'
import { workflowNodeConfig } from '../method-config'
import { clusterEvents, summarizeEventSentiment } from '@/lib/research/events'
import type { ResearchEvent } from '@/lib/research/contracts'
export const fetchNewsStep: StepDefinition = {
  name: 'fetch-news', description: '读取并清洗已入库资讯', dependencies: ['fetch-etfs', 'freeze-research'], estimatedDuration: 1000,
  async execute(context) {
    const industry = context.artifacts.get('industry-info') as any
    const codes = new Set((await getNewsTaxonomy()).filter(row => row.industry_id === industry.id).map(row => row.segment_code))
    if (!codes.size) throw new Error('该产业没有有效分类词典，停止资讯分析以避免混入无关资讯')
    const lookbackDays=Number(workflowNodeConfig(context,'fetch-news')?.parameters.lookbackDays??30)
    const candidates = await prisma.newsArticle.findMany({ where: { aiProcessed: true, publishTime: { gte: new Date(Date.now() - lookbackDays * 86400000), lte: new Date() }, OR: [...codes].map(code => ({ segmentCodes: { contains: JSON.stringify(code) } })) }, orderBy: { publishTime: 'desc' }, take: 100 })
    const rows = candidates.filter(row => matchesNewsIndustry(row.segmentCodes, codes))
    const meaningful = rows.filter(row => { const body = (row.content || '').replace(/\s+/g, '').trim(); return body.length >= 80 && body !== row.title.replace(/\s+/g, '').trim() })
    const articles = [...new Map(meaningful.filter((row) => row.title.trim() && row.source && !/基因芯片|育种|生物芯片/.test(row.title)).map((row) => [row.title.trim(), row])).values()].slice(0, 50)
    await context.saveArtifact('news-evidence-gaps', { fetched: rows.length, excludedWithoutSubstantiveBody: rows.length - meaningful.length, usable: articles.length, rule: '正文至少80字且不是标题复制；正文缺失只记录缺口，不用于AI事实推断' }, 'DATA')
    const frozenEvents=context.artifacts.get('research-snapshot')?.events
    const now=new Date().toISOString()
    const events:ResearchEvent[]=Array.isArray(frozenEvents)?frozenEvents:clusterEvents(articles.map(row=>({id:row.id,title:row.title,content:row.content,source:row.source,url:row.url,publishedAt:row.publishTime.toISOString(),fetchedAt:row.createdAt.toISOString(),kind:'news' as const,segments:[]})),now)
    const summary = summarizeEventSentiment(events,now)
    await context.saveArtifact('news-articles', articles, 'DATA')
    await context.saveArtifact('news-events', events, 'DATA')
    await context.saveArtifact('news-trends', { hot_keywords: [], sentiment_summary: summary }, 'DATA')
    await context.saveArtifact('news-sentiment', summary, 'DATA')
    await context.updateProgress(1, 1, `已归并 ${events.length} 个新闻与公告事件；${summary.evidenceEvents} 个具备正文证据`)
  }
}
